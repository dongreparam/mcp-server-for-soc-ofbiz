import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'listRecentErrors',
        metadata: {
            title: 'List Recent DataManager Errors',
            description: 'Find recent DataManagerLogs that ended in failure or error.',
            inputSchema: {
                limit: z.number().optional().default(10).describe('Max number of logs to return.'),
                configId: z.string().optional().describe('Filter by a specific configuration ID.')
            },
            outputSchema: {
                logs: z.array(z.object({
                    logId: z.string(),
                    configId: z.string().optional(),
                    ownerPartyId: z.string().optional(),
                    uploadFileContentId: z.string().optional(),
                    exportFileContentId: z.string().optional(),
                    logTypeEnumId: z.string().optional(),
                    createdByUserLogin: z.string().optional(),
                    createdDate: z.union([z.string(), z.number()]).optional(),
                    startDateTime: z.union([z.string(), z.number()]).optional(),
                    finishDateTime: z.union([z.string(), z.number()]).optional(),
                    cancelDateTime: z.union([z.string(), z.number()]).optional(),
                    jobId: z.string().optional(),
                    statusId: z.string().optional(),
                    errorRecordContentId: z.string().optional(),
                    logFileContentId: z.string().optional(),
                    runtimeDataId: z.string().optional(),
                    createdByJobId: z.string().optional(),
                    productStoreId: z.string().optional()
                })).describe('List of failed logs.')
            }
        },
        handler: async (args: { limit?: number; configId?: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            // Remove status filter to fetch all recent logs, then filter for errors in memory
            const inputFields: any = {};

            if (args.configId) {
                inputFields.configId = args.configId;
            }

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
                    inputFields: inputFields,
                    viewSize: args.limit || 20, // Increase default fetch size to catch errors
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
                console.error('Executing listRecentErrors against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json() as any;
                const docs = responseData.docs || [];

                // Filter for logs that are either explicitly failed OR have an error record
                const failedLogs = docs.filter((log: any) => {
                    return log.statusId === 'SERVICE_FAILED' ||
                        log.statusId === 'SERVICE_CRASHED' ||
                        log.statusId === 'DM_LOG_ERROR' ||
                        (log.errorRecordContentId && log.errorRecordContentId.trim() !== '');
                });

                const logs = failedLogs.map((log: any) => ({
                    logId: log.logId,
                    configId: log.configId || undefined,
                    ownerPartyId: log.ownerPartyId || undefined,
                    uploadFileContentId: log.uploadFileContentId || undefined,
                    exportFileContentId: log.exportFileContentId || undefined,
                    logTypeEnumId: log.logTypeEnumId || undefined,
                    createdByUserLogin: log.createdByUserLogin || undefined,
                    createdDate: log.createdDate || undefined,
                    startDateTime: log.startDateTime || undefined,
                    finishDateTime: log.finishDateTime || undefined,
                    cancelDateTime: log.cancelDateTime || undefined,
                    jobId: log.jobId || undefined,
                    statusId: log.statusId || undefined,
                    errorRecordContentId: log.errorRecordContentId || undefined,
                    logFileContentId: log.logFileContentId || undefined,
                    runtimeDataId: log.runtimeDataId || undefined,
                    createdByJobId: log.createdByJobId || undefined,
                    productStoreId: log.productStoreId || undefined,
                    reason: log.statusId || undefined
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(logs)
                        }
                    ],
                    structuredContent: { logs }
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
                            text: `Error finding recent errors: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
