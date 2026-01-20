
import { loadRuntimeConfig } from './build/lib/config/loader.js';
import getLogById from './build/tools/getLogById.js';
import getContent from './build/tools/getContent.js';
import fs from 'fs';
import path from 'path';

// Load Runtime
const configDir = path.resolve('config');
const toolsDir = path.resolve('src/tools');
const runtime = loadRuntimeConfig(configDir, toolsDir);

const logTool = getLogById(runtime.config);
const contentTool = getContent(runtime.config);

async function runAgentFlow(logId) {
    console.log(`[Agent] Investigating Log ID: ${logId}`);

    // 1. Get Log Details
    const logResult = await logTool.handler({ logId }, { authInfo: {} });

    if (logResult.isError) {
        console.error(`[Agent] Error fetching log: ${logResult.content[0].text}`);
        return;
    }

    const logData = logResult.structuredContent;
    console.log(`[Agent] Log Status: ${logData.statusId}`);

    // 2. Check for Error Content
    if (logData.errorRecordContentId) {
        console.log(`[Agent] Found errorRecordContentId: ${logData.errorRecordContentId}. Fetching content...`);

        const contentResult = await contentTool.handler({ contentId: logData.errorRecordContentId }, { authInfo: {} });

        if (contentResult.isError) {
            console.error(`[Agent] Failed to fetch content: ${contentResult.content[0].text}`);
        } else {
            console.log('[Agent] Content retrieved successfully.');
            // 3. Download/Save
            const fileName = `downloaded_error_${logId}_${logData.errorRecordContentId}.json`; // Assuming JSON based on what we saw earlier
            fs.writeFileSync(fileName, contentResult.content[0].text);
            console.log(`[Agent] SAVED content to: ${fileName}`);
        }
    } else {
        console.log('[Agent] No error record content found related to this log.');
    }
}

// Execute
runAgentFlow('40160').catch(err => console.error(err));
