import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'findOrderHeader',
        metadata: {
            title: 'Find Order Header',
            description: 'Find Order Header details to check status and validity.',
            inputSchema: {
                orderId: z.string().optional().describe('Order ID'),
                externalId: z.string().optional().describe('External Order ID (e.g. from SAPI)')
            },
            outputSchema: {
                orderId: z.string(),
                statusId: z.string().optional(),
                externalId: z.string().optional(),
                entryDate: z.union([z.string(), z.number()]).optional(),
                productStoreId: z.string().optional(),
                grandTotal: z.number().optional()
            }
        },
        handler: async (args: { orderId?: string; externalId?: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            const inputFields: any = {};
            if (args.orderId) inputFields.orderId = args.orderId;
            if (args.externalId) inputFields.externalId = args.externalId;

            if (Object.keys(inputFields).length === 0) {
                return {
                    content: [{ type: 'text', text: `Please provide either orderId or externalId` }],
                    isError: true
                };
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
                    entityName: 'OrderHeader',
                    noConditionFind: 'Y',
                    inputFields,
                    viewSize: 1
                }),
                agent: httpsAgent
            };

            try {
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json() as any;
                if (!data.docs || data.docs.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Order not found.` }],
                        isError: true
                    };
                }

                const order = data.docs[0];
                const result = {
                    orderId: order.orderId,
                    statusId: order.statusId,
                    externalId: order.externalId,
                    entryDate: order.entryDate,
                    productStoreId: order.productStoreId,
                    grandTotal: order.grandTotal
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
                console.error('Error in findOrderHeader:', error);
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
