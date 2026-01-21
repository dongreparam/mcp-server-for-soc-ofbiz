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
                    .describe('The unique identifier of the Content to retrieve.'),
                configId: z.string().optional().describe('The DataManager Config ID to optimize file saving path.'),
                category: z.enum(['uploaded', 'error']).optional().describe('Category of the file (uploaded or error) for organization.')
            },
            outputSchema: {
                contentId: z.string(),
                dataResourceId: z.string().optional(),
                textData: z.string().optional(),
                mimeType: z.string().optional(),
                savedPath: z.string().optional()
            }
        },
        handler: async (args: { contentId: string; configId?: string; category?: 'uploaded' | 'error' }, request: express.Request) => {
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
                }

                // Fallback / Primary for Files: Try to fetch from remote endpoint using downloadCSV
                if (!textData) {
                    try {
                        const token = (request as any).authInfo?.downstreamToken || serverConfig.BACKEND_ACCESS_TOKEN;
                        const fetchUrl = `${serverConfig.BACKEND_API_BASE}/api/DownloadCsvFile?contentId=${args.contentId}`;
                        console.error(`[getContent] Attempting remote fetch from: ${fetchUrl}`);

                        const remoteResponse = await fetch(fetchUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'User-Agent': serverConfig.BACKEND_USER_AGENT || ''
                            },
                            agent: httpsAgent
                        });

                        if (remoteResponse.ok) {
                            textData = await remoteResponse.text();
                        } else {
                            // Log the response text for debugging login page redirects
                            const errText = await remoteResponse.text();
                            console.error(`[getContent] Remote fetch failed: ${remoteResponse.status} ${remoteResponse.statusText}. Response preview: ${errText.substring(0, 200)}`);
                        }
                    } catch (remoteErr) {
                        console.error('[getContent] Remote fetch error:', remoteErr);
                    }
                }

                if (!textData) {
                    return {
                        content: [{ type: 'text', text: `No text content found for contentId: ${args.contentId} (Type: ${dataResourceTypeId})` }],
                        isError: true
                    };
                }

                // --- Persistence Logic ---
                let savedPath = undefined;
                if (args.configId) {
                    const category = args.category || 'uploaded';
                    const fs = await import('fs');
                    const path = await import('path');
                    const { fileURLToPath } = await import('url');

                    // Determine extension
                    let ext = '.txt';
                    const mimeType = contentRecord.mimeTypeId;
                    if (mimeType === 'text/csv' || mimeType === 'application/csv') ext = '.csv';
                    else if (mimeType === 'application/json') ext = '.json';
                    else if (mimeType === 'text/xml' || mimeType === 'application/xml') ext = '.xml';
                    else if (mimeType === 'application/pdf') ext = '.pdf';

                    // Recursive function to find 'runtime' directory
                    const findRuntimeDir = (startDir: string): string | null => {
                        let currentDir = startDir;
                        const root = path.parse(currentDir).root;
                        while (currentDir !== root) {
                            const candidate = path.join(currentDir, 'runtime');
                            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                                return candidate;
                            }
                            currentDir = path.dirname(currentDir);
                        }
                        // Check root as well
                        const candidate = path.join(root, 'runtime');
                        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                            return candidate;
                        }
                        return null;
                    };

                    const currentFileUrl = import.meta.url;
                    const currentFilePath = fileURLToPath(currentFileUrl);
                    const currentDir = path.dirname(currentFilePath);

                    const runtimeDir = findRuntimeDir(currentDir);

                    if (runtimeDir) {
                        const dirName = `${category}File_${args.configId}`;
                        const targetDir = path.join(runtimeDir, dirName);

                        if (!fs.existsSync(targetDir)) {
                            await fs.promises.mkdir(targetDir, { recursive: true });
                        }

                        const fileName = `${args.contentId}${ext}`;
                        savedPath = path.join(targetDir, fileName);

                        await fs.promises.writeFile(savedPath, textData, 'utf8');
                        console.log(`Saved content to: ${savedPath}`);
                    } else {
                        console.error('Could not find "runtime" directory in parent hierarchy.');
                    }
                }
                // -------------------------

                const result = {
                    contentId: args.contentId,
                    dataResourceId: dataResourceId || undefined,
                    textData: textData || undefined,
                    mimeType: contentRecord.mimeTypeId || undefined,
                    savedPath: savedPath
                };

                return {
                    content: [{ type: 'text', text: `Content Retrieved.\n${savedPath ? `Saved to: ${savedPath}\n` : ''}\nPreview:\n${textData.substring(0, 500)}...` }],
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
