import { z } from 'zod';
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

import type { ServerConfig, ToolDefinition } from '../lib/config/types.js';

export default function (serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'uploadFileToConfig',
        metadata: {
            title: 'Upload File to DataManager Config',
            description: 'Uploads a file content (e.g., CSV, JSON) to a specific DataManager Config in OFBiz.',
            inputSchema: {
                configId: z
                    .string()
                    .min(1)
                    .describe('The DataManager Config ID (e.g., IMP_SAPI_ORDER).'),
                file: z
                    .string()
                    .min(1)
                    .describe('The content of the file to upload (text or base64 encoded string).'),
                fileName: z
                    .string()
                    .min(1)
                    .describe('The name of the file (e.g., order.json, data.csv) used for type detection.')
            },
            outputSchema: {
                configId: z.string(),
                uploadFileContentId: z.string().optional(),
                status: z.string()
            }
        },
        handler: async (args: { configId: string; file: string; fileName: string }, request: express.Request) => {
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/api/service/uploadAndImportFile`;

            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });

            const authToken = (request as any).authInfo?.downstreamToken || serverConfig.BACKEND_ACCESS_TOKEN;

            try {
                const formData = new FormData();
                formData.append('configId', args.configId);

                // Create a Blob from the file content
                // If the input 'file' is Base64, we might need to decode it to binary if we want to send it as binary.
                // However, the tool instruction says "text or base64".
                // If we send it as text, OFBiz receiving "uploadedFile" from multipart will see it as a file.
                // If the user sends Base64 *content* intending it to be binary, we should decode it?
                // For now, let's assume 'file' is the STRING content to be saved.
                // If it is binary data represented as Base64, we should simple send it as is?
                // Input description: "The content of the file to upload".
                // If I upload a CSV, args.file = "a,b,c". I create a Blob(["a,b,c"]). Correct.

                // Create Blob
                const fileBlob = new Blob([args.file], { type: 'application/octet-stream' });
                formData.append('uploadedFile', fileBlob, args.fileName);

                // Add other metadata fields if necessary
                formData.append('_uploadedFile_fileName', args.fileName);

                // Prepare headers
                // Do NOT set Content-Type, let fetch set it with boundary
                const headers: Record<string, string> = {
                    'User-Agent': serverConfig.BACKEND_USER_AGENT || '',
                    Accept: 'application/json'
                };

                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }

                // Use node-fetch
                const response = await fetch(backendUrl, {
                    method: 'POST',
                    headers,
                    body: formData as any, // Cast to any to avoid type mismatch between Global FormData and node-fetch BodyInit
                    agent: httpsAgent
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`OFBiz service call failed: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const result = await response.json() as any;

                // Check for OFBiz service error responses embedded in 200 OK
                if (result.responseMessage === 'error' || result.responseMessage === 'fail') {
                    throw new Error(`Service returned error: ${result.errorMessage || result.errorMessageList}`);
                }

                const uploadFileContentId = result.uploadFileContentId;

                return {
                    content: [{
                        type: 'text',
                        text: `File uploaded successfully.\nConfig ID: ${args.configId}\nContent ID: ${uploadFileContentId || 'N/A'}`
                    }],
                    structuredContent: {
                        configId: args.configId,
                        uploadFileContentId: uploadFileContentId,
                        status: 'success'
                    }
                };

            } catch (error) {
                console.error('Error in uploadFileToConfig:', error);
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
