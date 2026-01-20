import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'findDataManagerLogs',
        metadata: {
            title: 'Find DataManager Logs',
            description: 'Find DataManager Logs based on search criteria.',
            inputSchema: {
                logId: z.string().optional().describe('The ID of the log to search for.'),
                configId: z.string().optional().describe('The configuration ID.'),
                statusId: z.string().optional().describe('The status of the log.'),
                jobId: z.string().optional().describe('The job ID.')
            },
            outputSchema: {
                logs: z.array(z.object({
                    logId: z.string(),
                    configId: z.string().optional(),
                    statusId: z.string().optional(),
                    jobId: z.string().optional(),
                    createdDate: z.union([z.string(), z.number()]).optional(),
                    reason: z.string().optional()
                })).describe('List of found logs.')
            }
        },
        handler: async (args: { logId?: string; configId?: string; statusId?: string; jobId?: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

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
                    inputFields: {
                        logId: args.logId,
                        configId: args.configId,
                        statusId: args.statusId,
                        jobId: args.jobId
                    },
                    viewSize: 20,
                    orderBy: '-createdDate'
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
                console.error('Executing findDataManagerLogs against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json() as any;
                const docs = responseData.docs || [];

                const logs = docs.map((log: any) => ({
                    logId: log.logId,
                    configId: log.configId || undefined,
                    statusId: log.statusId || undefined,
                    jobId: log.jobId || undefined,
                    createdDate: log.createdDate || undefined,
                    reason: log.statusId || undefined // reason is not returned by backend, mapping statusId as placeholder or just undefined
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(logs)
                        }
                    ],
                    structuredContent: {
                        logs
                    }
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
                            text: `Error finding DataManager logs: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
