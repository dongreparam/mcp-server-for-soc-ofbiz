import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'findOrderItems',
        metadata: {
            title: 'Find Order Items',
            description: 'Find line items for a specific order.',
            inputSchema: {
                orderId: z.string().describe('Order ID')
            },
            outputSchema: {
                items: z.array(z.object({
                    orderId: z.string(),
                    orderItemSeqId: z.string(),
                    productId: z.string().optional(),
                    itemDescription: z.string().optional(),
                    quantity: z.number().optional(),
                    unitPrice: z.number().optional(),
                    statusId: z.string().optional()
                })).describe('List of order items')
            }
        },
        handler: async (args: { orderId: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            // Input validation
            if (!args.orderId) {
                return {
                    content: [{ type: 'text', text: 'Error: orderId is required' }],
                    isError: true
                };
            }

            const inputFields = {
                orderId: args.orderId
            };

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
                    entityName: 'OrderItem',
                    noConditionFind: 'Y',
                    inputFields,
                    viewSize: 100, // Fetch up to 100 items
                    orderBy: 'orderItemSeqId'
                }),
                agent: httpsAgent
            };

            try {
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json() as any;
                const docs = data.docs || [];

                const items = docs.map((item: any) => ({
                    orderId: item.orderId,
                    orderItemSeqId: item.orderItemSeqId,
                    productId: item.productId,
                    itemDescription: item.itemDescription,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    statusId: item.statusId
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(items, null, 2)
                        }
                    ],
                    structuredContent: { items }
                };

            } catch (error) {
                console.error('Error in findOrderItems:', error);
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
