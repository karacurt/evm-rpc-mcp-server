import dotenv from 'dotenv'
import { formatCallTrace } from './helpers.js'
import fetch from 'node-fetch'
import { RPC_URL } from './constants.js'

dotenv.config()

interface RpcResponse {
  jsonrpc: string
  id: number
  result?: any
  error?: {
    code: number
    message: string
  }
}

async function testTrace(txHash: string) {
  console.log(`\nTesting transaction: ${txHash}`)
  
  try {
    // Get transaction info
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
    const txInfoData = await txInfoResponse.json() as RpcResponse
    
    if (!txInfoData.result) {
      throw new Error(`Transaction ${txHash} not found`)
    }
    
    // Get trace
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
    const traceData = await traceResponse.json() as RpcResponse
    
    if (!traceData.result) {
      throw new Error('Trace data not available')
    }
    
    // Format and display trace
    const formattedTrace = await formatCallTrace(traceData.result, txInfoData.result)
    console.log(formattedTrace)
    
  } catch (error: any) {
    console.error(`Error tracing ${txHash}:`, error.message)
  }
}

// List of transactions to test
const testTransactions = [
  '0xf5b5d8245f03daeb528541dc765583e057f03dbfaf7b009d8eb77b7eaf83e6bd', // Original test tx
  // Add more transaction hashes here
]

// Run tests
async function runTests() {
  console.log('Starting MCP tests...')
  console.log(`RPC URL: ${RPC_URL}`)
  
  for (const txHash of testTransactions) {
    await testTrace(txHash)
  }
  
  console.log('\nTests completed!')
}

runTests().catch(console.error) 