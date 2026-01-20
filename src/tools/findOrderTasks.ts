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
            const performFindUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            const commonHeaders = {
                'Content-Type': 'application/json',
                'User-Agent': serverConfig.BACKEND_USER_AGENT || '',
                Accept: 'application/json',
                Authorization: (request as any).authInfo?.downstreamToken
                    ? `Bearer ${(request as any).authInfo.downstreamToken}`
                    : (serverConfig.BACKEND_ACCESS_TOKEN ? `Bearer ${serverConfig.BACKEND_ACCESS_TOKEN}` : '')
            };

            try {
                // Step 1: Link Order to WorkEffort via OrderHeaderWorkEffort
                const linkRequestOptions = {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        entityName: 'OrderHeaderWorkEffort',
                        noConditionFind: 'Y',
                        inputFields: {
                            orderId: args.orderId
                        },
                        viewSize: 100 // Reasonable limit for tasks per order
                    }),
                    agent: httpsAgent
                };

                const linkResponse = await fetch(performFindUrl, linkRequestOptions);
                if (!linkResponse.ok) throw new Error(`Failed to fetch OrderHeaderWorkEffort: ${linkResponse.status}`);

                const linkData = await linkResponse.json() as any;
                const linkDocs = linkData.docs || [];

                if (linkDocs.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify([]) }],
                        structuredContent: { tasks: [] }
                    };
                }

                // Step 2: Fetch details for each WorkEffort found
                const tasks: any[] = [];

                for (const link of linkDocs) {
                    const taskMsg = {
                        entityName: 'WorkEffort',
                        inputFields: {
                            workEffortId: link.workEffortId
                        }
                    };

                    const taskRequestOptions = {
                        method: 'POST',
                        headers: commonHeaders,
                        body: JSON.stringify(taskMsg),
                        agent: httpsAgent
                    };

                    const taskResponse = await fetch(performFindUrl, taskRequestOptions);
                    if (taskResponse.ok) {
                        const taskData = await taskResponse.json() as any;
                        if (taskData.docs && taskData.docs.length > 0) {
                            const task = taskData.docs[0];

                            // Step 3: Filter by type (in-memory) if requested
                            if (args.workEffortTypeId && task.workEffortTypeId !== args.workEffortTypeId) {
                                continue;
                            }

                            tasks.push({
                                workEffortId: task.workEffortId,
                                workEffortName: task.workEffortName,
                                workEffortTypeId: task.workEffortTypeId,
                                currentStatusId: task.currentStatusId,
                                description: task.description || undefined, // Convert null to undefined
                                createdDate: task.createdDate ? new Date(task.createdDate).toISOString() : undefined // Convert timestamp to ISO string
                            });
                        }
                    }
                }

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
