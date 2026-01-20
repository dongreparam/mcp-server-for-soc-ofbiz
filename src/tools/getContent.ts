import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'getContent',
        metadata: {
            title: 'Get Content Text',
            description: 'Fetch the text content of a given Content ID (e.g. error log, text file).',
            inputSchema: {
                contentId: z
                    .string()
                    .min(1)
                    .describe('The unique identifier of the Content to retrieve.')
            },
            outputSchema: {
                contentId: z.string(),
                dataResourceId: z.string().optional(),
                textData: z.string().optional(),
                mimeType: z.string().optional()
            }
        },
        handler: async (args: { contentId: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            const getRequestOptions = (entityName: string, inputFields: any) => ({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': serverConfig.BACKEND_USER_AGENT || '',
                    Accept: 'application/json',
                    Authorization: (request as any).authInfo?.downstreamToken
                        ? `Bearer ${(request as any).authInfo.downstreamToken}`
                        : (serverConfig.BACKEND_ACCESS_TOKEN ? `Bearer ${serverConfig.BACKEND_ACCESS_TOKEN}` : '')
                },
                body: JSON.stringify({
                    entityName,
                    noConditionFind: 'Y',
                    inputFields,
                    viewSize: 1
                }),
                agent: httpsAgent
            });

            try {
                // 1. Fetch Content to get dataResourceId
                const contentResponse = await fetch(backendUrl, getRequestOptions('Content', { contentId: args.contentId }));
                if (!contentResponse.ok) throw new Error(`Failed to fetch Content: ${contentResponse.status}`);

                const contentData = await contentResponse.json() as any;
                if (!contentData.docs || contentData.docs.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Content not found: ${args.contentId}` }],
                        isError: true
                    };
                }
                const contentRecord = contentData.docs[0];
                const dataResourceId = contentRecord.dataResourceId;

                if (!dataResourceId) {
                    return {
                        content: [{ type: 'text', text: `No dataResourceId for Content: ${args.contentId}` }],
                        isError: true
                    };
                }

                // 2. Fetch DataResource to determine type
                const drResponse = await fetch(backendUrl, getRequestOptions('DataResource', { dataResourceId }));
                if (!drResponse.ok) throw new Error(`Failed to fetch DataResource: ${drResponse.status}`);
                const drData = await drResponse.json() as any;
                const dr = (drData.docs && drData.docs.length > 0) ? drData.docs[0] : null;

                if (!dr) {
                    return {
                        content: [{ type: 'text', text: `DataResource not found for ID: ${dataResourceId}` }],
                        isError: true
                    };
                }

                let textData = '';
                const dataResourceTypeId = dr.dataResourceTypeId;

                // 3. Handle based on Type
                if (dataResourceTypeId === 'ELECTRONIC_TEXT' || dataResourceTypeId === 'SHORT_TEXT') {
                    const textResponse = await fetch(backendUrl, getRequestOptions('ElectronicText', { dataResourceId }));
                    if (textResponse.ok) {
                        const textDataResponse = await textResponse.json() as any;
                        if (textDataResponse.docs && textDataResponse.docs.length > 0) {
                            textData = textDataResponse.docs[0].textData;
                        }
                    }
                } else if (dataResourceTypeId === 'OFBIZ_FILE' || dataResourceTypeId === 'LOCAL_FILE') {
                    // Start of Remote File Handling Logic
                    const objectInfo = dr.objectInfo || 'Unknown Path';

                    // Return a structured response indicating the file is on the remote server
                    // DO NOT crash by trying to read local disk
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `[REMOTE FILE LOG]
ID: ${args.contentId}
Name: ${contentRecord.contentName || 'Unknown'}
Type: ${dataResourceTypeId}
Remote Path: ${objectInfo}
MimeType: ${contentRecord.mimeTypeId || 'N/A'}

STATUS: Content is stored as a file on the remote server disk.
ACTION: Automated retrieval unavailable (Service 'renderDataResourceAsText' not exported).
       Please retrieve this file via SSH from the server path above.`
                            }
                        ],
                        structuredContent: {
                            contentId: args.contentId,
                            dataResourceId: dataResourceId,
                            textData: `[Remote File: ${objectInfo}]`, // Placeholder for schema compliance
                            mimeType: contentRecord.mimeTypeId || undefined
                        }
                    };
                }

                if (!textData && !['OFBIZ_FILE', 'LOCAL_FILE'].includes(dataResourceTypeId)) {
                    // Check if fallback to previous logic is needed or just return empty
                }

                const result = {
                    contentId: args.contentId,
                    dataResourceId: dataResourceId || undefined,
                    textData: textData || undefined,
                    mimeType: contentRecord.mimeTypeId || undefined
                };

                // Try to fetch from remote endpoint
                try {
                    const fetchUrl = `${serverConfig.BACKEND_API_BASE}/content/control/ViewBinaryDataResource?dataResourceId=${dataResourceId}`;
                    console.error(`[getContent] Attempting remote fetch from: ${fetchUrl}`);

                    const remoteResponse = await fetch(fetchUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': (request as any).authInfo?.downstreamToken
                                ? `Bearer ${(request as any).authInfo.downstreamToken}`
                                : (serverConfig.BACKEND_ACCESS_TOKEN ? `Bearer ${serverConfig.BACKEND_ACCESS_TOKEN}` : ''),
                            'User-Agent': serverConfig.BACKEND_USER_AGENT || ''
                        },
                        agent: httpsAgent
                    });

                    if (remoteResponse.ok) {
                        textData = await remoteResponse.text();
                        result.textData = textData;
                    } else {
                        console.error(`[getContent] Remote fetch failed: ${remoteResponse.status} ${remoteResponse.statusText}`);
                    }
                } catch (remoteErr) {
                    console.error('[getContent] Remote fetch error:', remoteErr);
                }

                if (!textData) {
                    return {
                        content: [{ type: 'text', text: `No ElectronicText or File found for dataResourceId: ${dataResourceId} (Remote fetch attempted)` }],
                        isError: true
                    };
                }

                return {
                    content: [{ type: 'text', text: textData }],
                    structuredContent: result
                };

            } catch (error) {
                console.error('Error in getContent:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
