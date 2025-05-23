#!/usr/bin/env node

import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js'
import {z} from 'zod'
import {zodToJsonSchema} from 'zod-to-json-schema'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import {BlockNumberSchema, GetBalanceSchema, GetTransactionCountSchema, GetBlockByNumberSchema, GetTransactionByHashSchema, CallSchema, ChainIdSchema, TraceTransactionSchema} from './zodSchemas.js'
import { RPC_URL } from './constants.js'
import { VERSION } from './version.js'
import { formatCallTrace, formatRawTrace } from './helpers.js'
dotenv.config()

// Create server instance
const server = new Server(
  {
    name: 'g7testnet-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'eth_blockNumber',
        description: 'Get current block number',
        inputSchema: zodToJsonSchema(BlockNumberSchema),
      },
      {
        name: 'eth_getBalance',
        description: 'Get account balance',
        inputSchema: zodToJsonSchema(GetBalanceSchema),
      },
      {
        name: 'eth_getTransactionCount',
        description: 'Get account nonce',
        inputSchema: zodToJsonSchema(GetTransactionCountSchema),
      },
      {
        name: 'eth_getBlockByNumber',
        description: 'Get block information',
        inputSchema: zodToJsonSchema(GetBlockByNumberSchema),
      },
      {
        name: 'eth_getTransactionByHash',
        description: 'Get transaction information',
        inputSchema: zodToJsonSchema(GetTransactionByHashSchema),
      },
      {
        name: 'eth_call',
        description: 'Make a contract call',
        inputSchema: zodToJsonSchema(CallSchema),
      },
      {
        name: 'eth_chainId',
        description: 'Get chain ID',
        inputSchema: zodToJsonSchema(ChainIdSchema),
      },
      {
        name: 'trace_transaction',
        description: 'Trace a transaction execution with detailed steps',
        inputSchema: zodToJsonSchema(TraceTransactionSchema),
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params?.name) {
      throw new Error('Missing tool name')
    }

    if (!request.params.arguments) {
      throw new Error('Missing arguments')
    }

    let params: any[] = []
    switch (request.params.name) {
      case 'eth_blockNumber':
        params = []
        break
      case 'eth_getBalance': {
        const args = request.params.arguments
        params = [args.address, args.block || 'latest']
        break
      }
      case 'eth_getTransactionCount': {
        const args = request.params.arguments
        params = [args.address, args.block || 'latest']
        break
      }
      case 'eth_getBlockByNumber': {
        const args = request.params.arguments
        params = [args.blockNumber, true]
        break
      }
      case 'eth_getTransactionByHash': {
        const args = request.params.arguments
        params = [args.txHash]
        break
      }
      case 'eth_call': {
        const args = request.params.arguments
        params = [
          {
            to: args.to,
            data: args.data,
          },
          args.block || 'latest',
        ]
        break
      }
      case 'eth_chainId': {
        params = []
        break
      }
      case 'trace_transaction': {
        const args = request.params.arguments
        const txHash = args.txHash
        
        // First get transaction info to get additional context
        const txInfoRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionByHash',
          params: [txHash],
        }
        
        const txInfoResponse = await fetch(RPC_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txInfoRequest),
        })
        const txInfoData = await txInfoResponse.json() as any
        
        if (!txInfoData.result) {
          throw new Error(`Transaction ${txHash} not found`)
        }
        
        // Now fetch the trace
        const traceRequest = {
          jsonrpc: '2.0',
          id: 2,
          method: 'debug_traceTransaction',
          params: [txHash, {
            tracer: "callTracer",
            timeout: "30s",
          }]
        }
        
        const traceResponse = await fetch(RPC_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(traceRequest),
        })
        const traceData = await traceResponse.json() as any
        
        if (!traceData.result) {
          // If callTracer fails, try standard VM trace
          const rawTraceRequest = {
            jsonrpc: '2.0',
            id: 3,
            method: 'debug_traceTransaction',
            params: [txHash, {}]
          }
          
          const rawTraceResponse = await fetch(RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rawTraceRequest),
          })
          const rawTraceData = await rawTraceResponse.json() as any
          
          // Process raw VM trace with enhanced source code and parameter decoding
          const formattedTrace = await formatRawTrace(rawTraceData.result, txInfoData.result)
          return { content: [{ type: 'text', text: formattedTrace }] }
        }
        
        // Process callTracer trace with enhanced source code and parameter decoding
        const formattedTrace = await formatCallTrace(traceData.result, txInfoData.result)
        return { content: [{ type: 'text', text: formattedTrace }] }
      }
      default:
        throw new Error(`Unknown method: ${request.params.name}`)
    }

    const rpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: request.params.name,
      params,
    }

    if (!RPC_URL) {
      throw new Error('RPC_URL is not set')
    }

    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    })
    const data = await response.json()
    return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}]}
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`)
    }
    throw new Error(`RPC call failed: ${error.message}`)
  }
})

// Start server
async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('RPC MCP Server running on stdio') 
}

runServer().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
