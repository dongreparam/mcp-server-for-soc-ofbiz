import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'getLogConfig',
        metadata: {
            title: 'Get DataManager Configuration',
            description: 'Fetch details of a DataManagerConfig.',
            inputSchema: {
                configId: z.string().describe('The ID of the configuration.')
            },
            outputSchema: {
                configId: z.string(),
                exportContentId: z.string().nullable().optional(),
                importServiceName: z.string().nullable().optional(),
                exportServiceName: z.string().nullable().optional(),
                exportServiceScreenName: z.string().nullable().optional(),
                exportServiceScreenLocation: z.string().nullable().optional(),
                description: z.string().nullable().optional(),
                scriptTitle: z.string().nullable().optional(),
                delimiter: z.string().nullable().optional(),
                fileNamePattern: z.string().nullable().optional(),
                executionModeId: z.string().nullable().optional(),
                multiThreading: z.string().nullable().optional(),
                importPath: z.string().nullable().optional(),
                exportPath: z.string().nullable().optional(),
                priority: z.number().nullable().optional()
            }
        },
        handler: async (args: { configId: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;
            const httpsAgent = new https.Agent({ rejectUnauthorized: false });

            const requestOptions: any = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': serverConfig.BACKEND_USER_AGENT || '',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    entityName: 'DataManagerConfig',
                    noConditionFind: 'Y',
                    inputFields: { configId: args.configId },
                    viewSize: 1
                }),
                agent: httpsAgent
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((request as any).authInfo?.downstreamToken) {
                requestOptions.headers['Authorization'] =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    `Bearer ${(request as any).authInfo.downstreamToken}`;
            } else if (serverConfig.BACKEND_ACCESS_TOKEN) {
                requestOptions.headers['Authorization'] = `Bearer ${serverConfig.BACKEND_ACCESS_TOKEN}`;
            }

            try {
                console.error('Executing getLogConfig against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const responseData = await response.json() as any;
                const docs = responseData.docs || [];

                if (docs.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Config ${args.configId} not found.` }],
                        isError: true
                    };
                }

                const config = docs[0];
                const structured = {
                    configId: config.configId,
                    exportContentId: config.exportContentId,
                    importServiceName: config.importServiceName,
                    exportServiceName: config.exportServiceName,
                    exportServiceScreenName: config.exportServiceScreenName,
                    exportServiceScreenLocation: config.exportServiceScreenLocation,
                    description: config.description,
                    scriptTitle: config.scriptTitle,
                    delimiter: config.delimiter,
                    fileNamePattern: config.fileNamePattern,
                    executionModeId: config.executionModeId,
                    multiThreading: config.multiThreading,
                    importPath: config.importPath,
                    exportPath: config.exportPath,
                    priority: config.priority
                };

                return {
                    content: [{ type: 'text', text: JSON.stringify(structured) }],
                    structuredContent: structured
                };
            } catch (error) {
                console.error('Error making backend request:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `DEBUG: URL: ${backendUrl}\nHEADERS: ${JSON.stringify(requestOptions.headers, null, 2)}\nBODY: ${requestOptions.body}`
                        },
                        {
                            type: 'text',
                            text: `Error fetching config: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
