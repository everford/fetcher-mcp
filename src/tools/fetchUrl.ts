import { chromium } from "playwright";
import { WebContentProcessor } from "../services/webContentProcessor.js";
import { FetchOptions } from "../types/index.js";

// Parse command line arguments, check for debug flag
const isDebugMode = process.argv.includes("--debug");

/**
 * Tool definition for fetch_url
 */
export const fetchUrlTool = {
  name: "fetch_url",
  description: "Retrieve web page content from a specified URL",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch",
      },
      timeout: {
        type: "number",
        description:
          "Page loading timeout in milliseconds, default is 30000 (30 seconds)",
      },
      waitUntil: {
        type: "string",
        description:
          "Specifies when navigation is considered complete, options: 'load', 'domcontentloaded', 'networkidle', 'commit', default is 'load'",
      },
      extractContent: {
        type: "boolean",
        description:
          "Whether to intelligently extract the main content, default is true",
      },
      maxLength: {
        type: "number",
        description:
          "Maximum length of returned content (in characters), default is no limit",
      },
      returnHtml: {
        type: "boolean",
        description:
          "Whether to return HTML content instead of Markdown, default is false",
      },
      waitForNavigation: {
        type: "boolean",
        description:
          "Whether to wait for additional navigation after initial page load (useful for sites with anti-bot verification), default is false",
      },
      navigationTimeout: {
        type: "number",
        description:
          "Maximum time to wait for additional navigation in milliseconds, default is 10000 (10 seconds)",
      },
      disableMedia: {
        type: "boolean",
        description:
          "Whether to disable media resources (images, stylesheets, fonts, media), default is true",
      },
      debug: {
        type: "boolean",
        description:
          "Whether to enable debug mode (showing browser window), overrides the --debug command line flag if specified",
      },
    },
    required: ["url"],
  }
};

/**
 * Implementation of the fetch_url tool
 */
export async function fetchUrl(args: any) {
  const url = String(args?.url || "");
  if (!url) {
    console.error(`[Error] URL parameter missing`);
    throw new Error("URL parameter is required");
  }

  const options: FetchOptions = {
    timeout: Number(args?.timeout) || 30000,
    waitUntil: String(args?.waitUntil || "load") as 'load' | 'domcontentloaded' | 'networkidle' | 'commit',
    extractContent: args?.extractContent !== false,
    maxLength: Number(args?.maxLength) || 0,
    returnHtml: args?.returnHtml === true,
    waitForNavigation: args?.waitForNavigation === true,
    navigationTimeout: Number(args?.navigationTimeout) || 10000,
    disableMedia: args?.disableMedia !== false,
    debug: args?.debug
  };

  // 确定是否启用调试模式（优先使用参数指定的值，否则使用命令行标志）
  const useDebugMode = options.debug !== undefined ? options.debug : isDebugMode;
  
  if (useDebugMode) {
    console.log(`[Debug] Debug mode enabled for URL: ${url}`);
  }

  const processor = new WebContentProcessor(options, '[FetchURL]');
  let browser = null;
  let page = null;

  try {
    browser = await chromium.launch({ headless: !useDebugMode });
    const context = await browser.newContext({
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    await context.route('**/*', async (route) => {
      const resourceType = route.request().resourceType();
      if (options.disableMedia && ['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    page = await context.newPage();
    
    const result = await processor.processPageContent(page, url);
    
    return {
      content: [{ type: "text", text: result.content }]
    };
  } finally {
    if (!useDebugMode) {
      if (page) await page.close().catch(e => console.error(`[Error] Failed to close page: ${e.message}`));
      if (browser) await browser.close().catch(e => console.error(`[Error] Failed to close browser: ${e.message}`));
    } else {
      console.log(`[Debug] Browser and page kept open for debugging. URL: ${url}`);
    }
  }
}