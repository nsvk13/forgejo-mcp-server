#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  ForgejoConfig,
  Repository,
  Issue,
  FileContent,
  PullRequest
} from './types/forgejo.types';

class ForgejoMCPServer {
  private server: Server;
  private config: ForgejoConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'forgejo-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.config = {
      baseUrl: process.env.FORGEJO_BASE_URL!,
      token: process.env.FORGEJO_TOKEN!,
    };

    this.setupToolHandlers();
  }

  private async forgejoRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.config.baseUrl}/api/v1${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new McpError(
        ErrorCode.InternalError,
        `Forgejo API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_repositories',
          description: 'Get list of user repositories',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username (optional, defaults to current user)',
              },
            },
          },
        },
        {
          name: 'get_repository',
          description: 'Get repository information',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'list_issues',
          description: 'Get list of repository issues',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              state: { 
                type: 'string', 
                enum: ['open', 'closed', 'all'],
                description: 'Issue state',
                default: 'open'
              },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'create_issue',
          description: 'Create a new issue',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              title: { type: 'string', description: 'Issue title' },
              body: { type: 'string', description: 'Issue description' },
            },
            required: ['owner', 'repo', 'title'],
          },
        },
        {
          name: 'get_file_content',
          description: 'Get file content from repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              path: { type: 'string', description: 'File path' },
              ref: { 
                type: 'string', 
                description: 'Branch or commit (defaults to main)',
                default: 'main'
              },
            },
            required: ['owner', 'repo', 'path'],
          },
        },
        {
          name: 'list_pull_requests',
          description: 'Get list of repository pull requests',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              state: {
                type: 'string',
                enum: ['open', 'closed', 'all'],
                description: 'Pull request state',
                default: 'open'
              },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'get_pull_request',
          description: 'Get a single pull request by its number',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              index: { type: 'number', description: 'Pull request number' },
            },
            required: ['owner', 'repo', 'index'],
          },
        },
        {
          name: 'create_pull_request',
          description: 'Open a new pull request from a head branch into a base branch',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              title: { type: 'string', description: 'Pull request title' },
              head: { type: 'string', description: 'Source branch (the branch with your changes)' },
              base: { type: 'string', description: 'Target branch to merge into' },
              body: { type: 'string', description: 'Pull request description' },
            },
            required: ['owner', 'repo', 'title', 'head', 'base'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'list_repositories':
          return this.listRepositories(request.params.arguments);
        
        case 'get_repository':
          return this.getRepository(request.params.arguments);
        
        case 'list_issues':
          return this.listIssues(request.params.arguments);
        
        case 'create_issue':
          return this.createIssue(request.params.arguments);
        
        case 'get_file_content':
          return this.getFileContent(request.params.arguments);

        case 'list_pull_requests':
          return this.listPullRequests(request.params.arguments);

        case 'get_pull_request':
          return this.getPullRequest(request.params.arguments);

        case 'create_pull_request':
          return this.createPullRequest(request.params.arguments);

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async listRepositories(args: any) {
    const endpoint = args?.username 
      ? `/users/${args.username}/repos`
      : '/user/repos';
    
    const repos = await this.forgejoRequest(endpoint) as Repository[];
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${repos.length} repositories:\n\n` +
                repos.map(repo => 
                  `• ${repo.full_name} - ${repo.description || 'No description'}`
                ).join('\n'),
        },
      ],
    };
  }

  private async getRepository(args: any) {
    const { owner, repo } = args;
    const repository = await this.forgejoRequest(`/repos/${owner}/${repo}`) as Repository;
    
    return {
      content: [
        {
          type: 'text',
          text: `Repository: ${repository.full_name}\n` +
                `ID: ${repository.id}\n` +
                `Description: ${repository.description || 'No description'}`,
        },
      ],
    };
  }

  private async listIssues(args: any) {
    const { owner, repo, state = 'open' } = args;
    const issues = await this.forgejoRequest(
      `/repos/${owner}/${repo}/issues?state=${state}`
    ) as Issue[];
    
    return {
      content: [
        {
          type: 'text',
          text: `Issues in repository ${owner}/${repo} (${state}):\n\n` +
                issues.map(issue => 
                  `#${issue.number}: ${issue.title} [${issue.state}]`
                ).join('\n'),
        },
      ],
    };
  }

  private async createIssue(args: any) {
    const { owner, repo, title, body = '' } = args;
    
    const newIssue = await this.forgejoRequest(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
      }),
    }) as Issue;
    
    return {
      content: [
        {
          type: 'text',
          text: `Issue created successfully!\n` +
                `Number: #${newIssue.number}\n` +
                `Title: ${newIssue.title}\n` +
                `URL: ${newIssue.html_url}`,
        },
      ],
    };
  }

  private async getFileContent(args: any) {
    const { owner, repo, path, ref = 'main' } = args;
    
    const fileData = await this.forgejoRequest(
      `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`
    ) as FileContent;
    
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    
    return {
      content: [
        {
          type: 'text',
          text: `File: ${path} (branch: ${ref})\n` +
                `Size: ${fileData.size} bytes\n\n` +
                `Content:\n\`\`\`\n${content}\n\`\`\``,
        },
      ],
    };
  }

  private async listPullRequests(args: any) {
    const { owner, repo, state = 'open' } = args;
    const prs = await this.forgejoRequest(
      `/repos/${owner}/${repo}/pulls?state=${state}`
    ) as PullRequest[];

    return {
      content: [
        {
          type: 'text',
          text: `Pull requests in repository ${owner}/${repo} (${state}):\n\n` +
                prs.map(pr =>
                  `#${pr.number}: ${pr.title} [${pr.state}] (${pr.head.ref} → ${pr.base.ref})`
                ).join('\n'),
        },
      ],
    };
  }

  private async getPullRequest(args: any) {
    const { owner, repo, index } = args;
    const pr = await this.forgejoRequest(
      `/repos/${owner}/${repo}/pulls/${index}`
    ) as PullRequest;

    return {
      content: [
        {
          type: 'text',
          text: `PR #${pr.number}: ${pr.title} [${pr.state}]\n` +
                `${pr.head.ref} → ${pr.base.ref}\n` +
                `Merged: ${pr.merged}\n` +
                `URL: ${pr.html_url}\n\n` +
                `${pr.body || 'No description'}`,
        },
      ],
    };
  }

  private async createPullRequest(args: any) {
    const { owner, repo, title, head, base, body = '' } = args;

    const pr = await this.forgejoRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        head,
        base,
        body,
      }),
    }) as PullRequest;

    return {
      content: [
        {
          type: 'text',
          text: `Pull request created successfully!\n` +
                `Number: #${pr.number}\n` +
                `Title: ${pr.title}\n` +
                `${pr.head.ref} → ${pr.base.ref}\n` +
                `URL: ${pr.html_url}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Forgejo MCP server started');
  }
}

const server = new ForgejoMCPServer();
server.run().catch(console.error);