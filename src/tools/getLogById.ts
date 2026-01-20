import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'getLogById',
        metadata: {
            title: 'Get DataManager Log Details',
            description: 'Fetch details of a specific DataManagerLog by its ID.',
            inputSchema: {
                logId: z
                    .string()
                    .min(1)
                    .describe('The unique identifier of the DataManagerLog to retrieve.')
            },
            outputSchema: {
                logId: z.string().describe('The log ID.'),
                configId: z.string().nullable().optional(),
                ownerPartyId: z.string().nullable().optional(),
                uploadFileContentId: z.string().nullable().optional(),
                exportFileContentId: z.string().nullable().optional(),
                logTypeEnumId: z.string().nullable().optional(),
                createdByUserLogin: z.string().nullable().optional(),
                createdDate: z.union([z.string(), z.number()]).nullable().optional(),
                startDateTime: z.union([z.string(), z.number()]).nullable().optional(),
                finishDateTime: z.union([z.string(), z.number()]).nullable().optional(),
                cancelDateTime: z.union([z.string(), z.number()]).nullable().optional(),
                jobId: z.string().nullable().optional(),
                statusId: z.string().nullable().optional(),
                errorRecordContentId: z.string().nullable().optional(),
                logFileContentId: z.string().nullable().optional(),
                runtimeDataId: z.string().nullable().optional(),
                createdByJobId: z.string().nullable().optional(),
                productStoreId: z.string().nullable().optional()
            }
        },
        handler: async (args: { logId: string }, request: express.Request) => {
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
                        logId: args.logId
                    },
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
                console.error('Executing getLogById against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                const response = await fetch(backendUrl, requestOptions);
                console.error(`[TRACE] Response Status: ${response.status} ${response.statusText}`);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json() as any;
                console.error('[TRACE] Response Body:', JSON.stringify(responseData, null, 2));
                const docs = responseData.docs || [];

                if (docs.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `No DataManagerLog found with ID: ${args.logId}`
                            }
                        ],
                        isError: true
                    };
                }

                const log = docs[0];
                const structuredContent = {
                    logId: log.logId,
                    configId: log.configId,
                    ownerPartyId: log.ownerPartyId,
                    uploadFileContentId: log.uploadFileContentId,
                    exportFileContentId: log.exportFileContentId,
                    logTypeEnumId: log.logTypeEnumId,
                    createdByUserLogin: log.createdByUserLogin,
                    createdDate: log.createdDate,
                    startDateTime: log.startDateTime,
                    finishDateTime: log.finishDateTime,
                    cancelDateTime: log.cancelDateTime,
                    jobId: log.jobId,
                    statusId: log.statusId,
                    errorRecordContentId: log.errorRecordContentId,
                    logFileContentId: log.logFileContentId,
                    runtimeDataId: log.runtimeDataId,
                    createdByJobId: log.createdByJobId,
                    productStoreId: log.productStoreId
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(structuredContent)
                        }
                    ],
                    structuredContent: structuredContent
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
                            text: `Error fetching DataManagerLog: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}
