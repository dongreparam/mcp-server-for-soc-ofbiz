import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'retryFailedRecord',
        metadata: {
            title: 'Retry Failed DataManager Log',
            description: 'Attempt to retry a failed DataManager job or provide instructions.',
            inputSchema: {
                logId: z.string().describe('The ID of the failed log to retry.')
            },
            outputSchema: {
                message: z.string().describe('Result message or instructions.'),
                canRetry: z.boolean().describe('Whether automatic retry is possible.')
            }
        },
        handler: async (args: { logId: string }, request: express.Request) => {
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
                    entityName: 'DataManagerLog',
                    noConditionFind: 'Y',
                    inputFields: { logId: args.logId.trim() },
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
                console.error('Executing retryFailedRecord (fetch log) against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));

                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const responseData = await response.json() as any;
                const docs = responseData.docs || [];

                if (docs.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Log ${args.logId} not found.` }],
                        isError: true
                    };
                }

                const log = docs[0];

                const message = `
Retry Context for Log ${args.logId}:
- Config ID: ${log.configId}
- Status: ${log.statusId}
- Original Job ID: ${log.jobId}
- Runtime Data ID: ${log.runtimeDataId}

Automatic retry via MCP is not yet fully implemented. 
To manually retry:
1. Identify the file from 'getLogConfig' using Config ID ${log.configId}.
2. Re-trigger the import/export service associated with that config.
        `.trim();

                return {
                    content: [
                        {
                            type: 'text',
                            text: message
                        }
                    ],
                    structuredContent: {
                        message,
                        canRetry: false
                    }
                };

            } catch (error) {
                console.error('Error in retry logic:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `DEBUG: URL: ${backendUrl}\nHEADERS: ${JSON.stringify(requestOptions.headers, null, 2)}\nBODY: ${requestOptions.body}`
                        },
                        {
                            type: 'text',
                            text: `Error checking retry: ${error instanceof Error ? error.message : 'Unknown'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
