import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'findPickProfileGroups',
        metadata: {
            title: 'Find Pick Profile Groups',
            description: 'Find Pick Profile Groups based on search criteria.',
            inputSchema: {
                pickProfileGroupId: z.string().optional().describe('The ID of the pick profile group to search for.'),
                groupName: z.string().optional().describe('The name of the pick profile group to search for.'),
                description: z.string().optional().describe('The description of the pick profile group to search for.')
            },
            outputSchema: {
                pickProfileGroups: z.array(z.object({
                    pickProfileGroupId: z.string(),
                    groupName: z.string().optional(),
                    description: z.string().optional()
                })).describe('List of found pick profile groups.')
            }
        },
        handler: async (args: { pickProfileGroupId?: string; groupName?: string; description?: string }, request: express.Request) => {
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
                    entityName: 'PickProfileGroup',
                    noConditionFind: 'Y',
                    inputFields: {
                        pickProfileGroupId: args.pickProfileGroupId,
                        groupName: args.groupName,
                        description: args.description
                    },
                    viewSize: 20
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
                console.error('Executing findPickProfileGroups against:', backendUrl);
                console.error('Payload:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json() as any;
                const pickProfileGroups = responseData.docs || [];

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(pickProfileGroups)
                        }
                    ],
                    structuredContent: {
                        pickProfileGroups
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
                            text: `Error finding pick profile groups: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    };
}