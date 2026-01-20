import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'findOrderTasks',
        metadata: {
            title: 'Find Order Tasks',
            description: 'Find WorkEfforts (tasks) associated with an order, primarily to check for validation holds.',
            inputSchema: {
                orderId: z.string().describe('Order ID'),
                workEffortTypeId: z.string().optional().default('RESOLVE_ONHOLD_ORDER').describe('Type of task to find.')
            },
            outputSchema: {
                tasks: z.array(z.object({
                    workEffortId: z.string(),
                    workEffortName: z.string().optional(),
                    workEffortTypeId: z.string().optional(),
                    currentStatusId: z.string().optional(),
                    description: z.string().optional(),
                    createdDate: z.string().optional()
                }))
            }
        },
        handler: async (args: { orderId: string; workEffortTypeId?: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            // Assuming sourceReferenceId is used for Order ID linkage in standard WorkEffort usage for tasks
            const inputFields: any = {
                sourceReferenceId: args.orderId
            };
            if (args.workEffortTypeId) {
                inputFields.workEffortTypeId = args.workEffortTypeId;
            } else {
                inputFields.workEffortTypeId = 'RESOLVE_ONHOLD_ORDER';
            }

            const requestOptions = {
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
                    entityName: 'WorkEffort',
                    noConditionFind: 'Y',
                    inputFields,
                    viewSize: 20,
                    orderBy: '-createdDate'
                }),
                agent: httpsAgent
            };

            try {
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json() as any;
                const docs = data.docs || [];

                const tasks = docs.map((task: any) => ({
                    workEffortId: task.workEffortId,
                    workEffortName: task.workEffortName,
                    workEffortTypeId: task.workEffortTypeId,
                    currentStatusId: task.currentStatusId,
                    description: task.description,
                    createdDate: task.createdDate
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(tasks)
                        }
                    ],
                    structuredContent: { tasks }
                };

            } catch (error) {
                console.error('Error in findOrderTasks:', error);
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
