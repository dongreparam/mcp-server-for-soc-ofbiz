import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'getImportSapiOrderConfig',
        metadata: {
            title: 'Get Import SAPI Order Config',
            description: 'Fetch details of the DataManagerConfig for the SAPI order import job.',
            inputSchema: {
                configId: z.string().optional().default('IMP_SAPI_ORDER').describe('The ID of the configuration. Defaults to IMP_SAPI_ORDER.')
            },
            outputSchema: {
                configId: z.string().optional(),
                description: z.string().optional(),
                jobName: z.string().optional(),
                runtimeDataId: z.string().optional(),
                runtimeInfo: z.string().optional().describe('Parsed runtime data if available')
            }
        },
        handler: async (args: { configId?: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;
            const configId = args.configId || 'IMP_SAPI_ORDER';

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
                // 1. Fetch DataManagerConfig
                console.error(`Fetching DataManagerConfig for ${configId}`);
                const response = await fetch(backendUrl, getRequestOptions('DataManagerConfig', { dataManagerConfigId: configId }));
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json() as any;
                if (!data.docs || data.docs.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Config not found: ${configId}` }],
                        isError: true
                    };
                }

                const config = data.docs[0];
                let runtimeInfo = undefined;

                // 2. Fetch RuntimeData if present
                if (config.runtimeDataId) {
                    const rtResponse = await fetch(backendUrl, getRequestOptions('RuntimeData', { runtimeDataId: config.runtimeDataId }));
                    if (rtResponse.ok) {
                        const rtData = await rtResponse.json() as any;
                        if (rtData.docs && rtData.docs.length > 0) {
                            runtimeInfo = rtData.docs[0].runtimeInfo;
                        }
                    }
                }

                const result = {
                    configId: config.dataManagerConfigId || args.configId,
                    description: config.description || undefined,
                    jobName: config.jobName || undefined,
                    runtimeDataId: config.runtimeDataId || undefined,
                    runtimeInfo: config.runtimeInfo || undefined
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ],
                    structuredContent: result
                };

            } catch (error) {
                console.error('Error in getImportSapiOrderConfig:', error);
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
