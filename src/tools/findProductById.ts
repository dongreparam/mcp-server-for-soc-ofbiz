import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
  return {
    name: 'findProductById',
    metadata: {
      title: 'Find Product by ID',
      description: 'Find a product by its ID or internal name.',
      inputSchema: {
        id: z.string().min(2).describe('ID or Internal Name of the product to find.')
      },
      outputSchema: {
        productId: z.string(),
        productName: z.string().optional(),
        internalName: z.string().optional(),
        description: z.string().optional(),
        productTypeId: z.string().optional(),
        isVirtual: z.string().optional(),
        isVariant: z.string().optional()
      }
    },
    handler: async (args: { id: string }, request: express.Request) => {
      const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/performFind`;

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
        // Try finding by productId first
        let response = await fetch(backendUrl, getRequestOptions('Product', { productId: args.id }));
        let data = await response.json() as any;

        if (!data.docs || data.docs.length === 0) {
          // Fallback: Try finding by internalName
          response = await fetch(backendUrl, getRequestOptions('Product', { internalName: args.id }));
          data = await response.json() as any;
        }

        if (!data.docs || data.docs.length === 0) {
          return {
            content: [{ type: 'text', text: `Product not found: ${args.id}` }],
            isError: true
          };
        }

        const product = data.docs[0];
        const result = {
          productId: product.productId,
          productName: product.productName || undefined,
          internalName: product.internalName || undefined,
          description: product.description || undefined,
          productTypeId: product.productTypeId || undefined,
          isVirtual: product.isVirtual || undefined,
          isVariant: product.isVariant || undefined
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
        console.error('Error in findProductById:', error);
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