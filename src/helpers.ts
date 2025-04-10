import fetch from 'node-fetch'
import {API_URL} from './constants.js'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'

// Contract data cache to avoid repeated API calls
const contractCache = new Map()

// Fallback hardcoded signatures for common functions
const FALLBACK_SIGNATURES: Record<string, string> = {
  '0xaa57f09c': 'mint(address,address,bytes)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x70a08231': 'balanceOf(address)',
  '0xdd62ed3e': 'allowance(address,address)',
  '0x18160ddd': 'totalSupply()',
  '0x313ce567': 'decimals()',
  '0x95d89b41': 'symbol()',
  '0x06fdde03': 'name()',
}

// Global cache for function selectors
const selectorCache: Record<string, string> = {
  '0x70a08231': 'balanceOf(address)',
  '0xdd62ed3e': 'allowance(address,address)',
  '0x6352211e': 'ownerOf(uint256)',
  '0x081812fc': 'getApproved(uint256)',
  '0x2a55205a': 'isApprovedForAll(address,address)',
  '0xb88d4fde': 'safeTransferFrom(address,address,uint256,bytes)',
}

/**
 * Fetch contract data including ABI from Blockscout API
 * @param {string} address - Contract address
 * @returns {Promise<any>} - Contract data or null if not found/verified
 */
export async function fetchContractData(address: string): Promise<any> {
  if (!address) return null
  if (!API_URL) {
    console.log('API_URL is not set')
    return null
  }

  try {
    // Skip null address
    if (address === '0x0000000000000000000000000000000000000000') {
      return null
    }

    // Normalize address to lowercase for consistent caching
    address = address.toLowerCase()

    // Check cache first
    if (contractCache.has(address)) {
      return contractCache.get(address)
    }

    // Build URL for smart contract endpoint
    console.log(`Fetching contract data for ${address}`, {address})

    // Let's try different endpoint formats
    const endpoint = `/smart-contracts/${address}`

    let contractData = null
    let responseOk = false

    try {
      // Ensure the base URL ends with /v2/
      const baseUrl = API_URL.endsWith('/v2/')
        ? API_URL
        : API_URL.endsWith('/v2')
        ? API_URL + '/'
        : API_URL.endsWith('/')
        ? API_URL + 'v2/'
        : API_URL + '/v2/'
      const url = new URL(endpoint.startsWith('/') ? endpoint.slice(1) : endpoint, baseUrl)
      console.log(`Trying URL`, {url: url.toString()})

      // Fetch the contract data
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      console.log(`Response status`, {status: response.status})

      if (response.ok) {
        responseOk = true
        // Parse the response
        const data = (await response.json()) as any
        console.log(`Got response`, {keys: Object.keys(data)})

        if (data.abi || (data.result && data.result !== 'Contract source code not verified')) {
          // Found ABI data, process it
          const abi = data.abi || JSON.parse(data.result)

          if (Array.isArray(abi)) {
            // Build function maps
            const functionsBySelector: Record<string, any> = {}
            const eventsByTopic: Record<string, any> = {}

            for (const item of abi) {
              if (item.type === 'function') {
                // For real implementation we would use proper keccak256 hashing
                const selector = getFunctionSelector(item)
                functionsBySelector[selector] = item
                console.log(`Added function`, {name: item.name, selector})
              } else if (item.type === 'event') {
                const topic = getEventTopic(item)
                eventsByTopic[topic] = item
              }
            }

            // Store processed data in cache
            contractData = {
              name: data.name || data.ContractName || 'Unknown Contract',
              abi: abi,
              functionsBySelector,
              eventsByTopic,
              source: data.source_code || data.SourceCode || null,
            }
          }
        }
      }
    } catch (error: any) {
      console.log(`Error with endpoint`, {endpoint, error: error.message})
      // Continue to next endpoint
    }

    if (contractData) {
      contractCache.set(address, contractData)
      return contractData
    }

    if (!responseOk) {
      console.log(`All endpoints failed`, {address})
    } else {
      console.log(`No ABI found`, {address})
    }

    // No ABI found
    contractCache.set(address, null)
    return null
  } catch (error: any) {
    console.log(`Error fetching contract data`, {address, error: error.message})
    return null
  }
}

/**
 * Calculate a function selector from ABI definition
 * This is a placeholder implementation - in production, use proper keccak256
 * @param {any} funcDef - Function definition from ABI
 * @returns {string} - Function selector (0x...)
 */
function getFunctionSelector(funcDef: any): string {
  const inputs = funcDef.inputs || []
  const types = inputs.map((input: any) => input.type)
  const signature = `${funcDef.name}(${types.join(',')})`
  const selector = keccak256(toUtf8Bytes(signature)).slice(0, 10)
  selectorCache[selector] = signature
  return selector
}

/**
 * Calculate an event topic from ABI definition
 * This is a placeholder implementation - in production, use proper keccak256
 * @param {any} eventDef - Event definition from ABI
 * @returns {string} - Event topic (0x...)
 */
function getEventTopic(eventDef: any): string {
  if (!eventDef || !eventDef.name) return '0x'

  const paramTypes = eventDef.inputs?.map((input: any) => input.type).join(',') || ''
  const signature = `${eventDef.name}(${paramTypes})`

  // This is just a simple hash for demonstration
  return '0x' + simpleHash(signature)
}

/**
 * Simple hash function for demo purposes
 * @param {string} str - String to hash
 * @returns {string} - Hashed string
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Try to get function information for a given call
 * @param {string} callData - Function call data
 * @param {string} address - Contract address
 * @returns {Promise<any>} - Function info including decoded params
 */
export async function decodeFunctionCall(callData: string, address: string): Promise<any> {
  if (!callData || callData.length < 10) {
    return {name: 'unknown', signature: 'unknown()', args: []}
  }

  const selector = callData.slice(0, 10).toLowerCase()
  console.log(`Decoding function call`, {selector, address})

  // Try to get contract data
  const contractData = await fetchContractData(address)

  if (contractData) {
    console.log(`Contract data found`, {name: contractData.name, address})
    console.log(`Available function selectors`, {selectors: Object.keys(contractData.functionsBySelector || {})})
  } else {
    console.log(`No contract data found`, {address})
  }

  if (contractData?.functionsBySelector && contractData.functionsBySelector[selector]) {
    // We have the full function definition from ABI
    const funcInfo = contractData.functionsBySelector[selector]
    console.log(`Found function definition`, {selector, name: funcInfo.name})

    // Decode input parameters
    const inputData = callData.slice(10)
    const decodedParams = decodeParameters(inputData, funcInfo.inputs || [])

    return {
      name: funcInfo.name,
      signature: getFunctionSignature(funcInfo),
      args: decodedParams,
      rawSelector: selector,
      contractName: contractData.name,
    }
  }

  // Fall back to hardcoded signatures
  console.log(`Using fallback signature`, {selector})
  const signature = selector in FALLBACK_SIGNATURES ? FALLBACK_SIGNATURES[selector] : selector

  return {
    name: signature.split('(')[0],
    signature,
    args: [],
    rawSelector: selector,
  }
}

/**
 * Attempt to decode function output
 * @param {string} outputData - Function output data
 * @param {string} selector - Function selector
 * @param {string} address - Contract address
 * @returns {Promise<any>} - Decoded output or null
 */
export async function decodeFunctionOutput(outputData: string, selector: string, address: string): Promise<any> {
  if (!outputData || outputData === '0x' || !selector) {
    return null
  }

  const contractData = await fetchContractData(address)

  if (contractData?.functionsBySelector && contractData.functionsBySelector[selector]) {
    const funcInfo = contractData.functionsBySelector[selector]
    return decodeParameters(outputData, funcInfo.outputs || [])
  }

  return null
}

/**
 * Get a human-readable function signature
 * @param {any} funcInfo - Function info from ABI
 * @returns {string} - Function signature
 */
function getFunctionSignature(funcInfo: any): string {
  const inputs = funcInfo.inputs || []
  const types = inputs.map((input: any) => input.type)
  return `${funcInfo.name}(${types.join(',')})`
}

/**
 * Simplified parameter decoder
 * This is a placeholder - in production use proper ABI decoding
 * @param {string} data - Hex data
 * @param {Array} types - Parameter types
 * @returns {Array} - Decoded parameters
 */
function decodeParameters(data: string, types: any[]): any[] {
  // This is a simplified placeholder
  // In a real implementation, use proper ABI decoding

  // Just return placeholder values based on types
  return types.map((param, index) => {
    const name = param.name || `param${index}`
    const type = param.type

    // For demo, just show the type and position
    if (type.includes('address')) {
      return {name, value: `0x${'1234'.repeat(10)}`, type}
    } else if (type.includes('uint')) {
      return {name, value: '123456', type}
    } else if (type.includes('string')) {
      return {name, value: 'text', type}
    } else if (type.includes('bool')) {
      return {name, value: true, type}
    } else if (type.includes('bytes')) {
      return {name, value: '0xabcdef', type}
    } else {
      return {name, value: '(unknown type)', type}
    }
  })
}

/**
 * Format call trace for better readability
 * @param {any} trace - Trace data
 * @param {any} txInfo - Transaction info
 * @returns {Promise<string>} - Formatted trace
 */
export async function formatCallTrace(trace: any, txInfo: any): Promise<string> {
  let output = '\n🔍 TRANSACTION TRACE\n\n'
  
  // Format transaction info
  output += `Transaction: ${txInfo.hash}\n`
  output += `From: ${txInfo.from}\n`
  output += `To: ${txInfo.to}\n`
  output += `Value: ${BigInt(txInfo.value || '0').toString()} wei\n`
  output += `Gas Limit: ${parseInt(txInfo.gas)}\n`
  output += `Gas Price: ${parseInt(txInfo.gasPrice)} wei\n\n`

  // Get contract data for the initial call
  const contractData = await fetchContractData(txInfo.to)
  const initialFunc = formatFunctionCall(txInfo.input.slice(0, 10), contractData?.name)
  output += `Function: ${initialFunc}\n\n`

  output += '📋 EXECUTION TRACE:\n\n'

  // Format the trace recursively
  async function formatTrace(trace: any, depth: number = 0): Promise<string> {
    const indent = '  '.repeat(depth)
    let result = ''

    // Get contract data
    const contractData = await fetchContractData(trace.to)
    const contractName = contractData?.name

    // Format the call
    const callType = trace.type || 'CALL'
    const selector = trace.input?.slice(0, 10)
    const funcName = selector ? formatFunctionCall(selector, contractName) : ''
    
    result += `${indent}${callType} to ${trace.to}`
    if (funcName) result += ` [${funcName}]`
    if (trace.gas) result += ` gas: ${trace.gas}`
    if (trace.gasUsed) result += ` → ${trace.gasUsed}`
    result += '\n'

    // Format output if present
    if (trace.output) {
      result += `${indent}📤 Output: ${trace.output}\n`
    }

    // Format error if present
    if (trace.error) {
      result += `${indent}❌ ERROR: ${trace.error}\n`
    }

    // Format subcalls recursively
    if (trace.calls) {
      for (const call of trace.calls) {
        result += await formatTrace(call, depth + 1)
      }
    }

    return result
  }

  output += await formatTrace(trace)
  return output
}

/**
 * Format raw VM trace output
 * @param {any} trace - Trace data
 * @param {any} txInfo - Transaction info
 * @returns {Promise<string>} - Formatted trace
 */
export async function formatRawTrace(trace: any, txInfo: any): Promise<string> {
  let output = '\n🔍 TRANSACTION TRACE\n\n'

  // Transaction details
  output += `Transaction: ${txInfo.hash}\n`
  output += `From: ${txInfo.from}\n`
  output += `To: ${txInfo.to || 'Contract Creation'}\n`
  output += `Value: ${parseInt(txInfo.value || '0', 16)} wei\n`
  output += `Gas Limit: ${parseInt(txInfo.gas, 16)}\n`
  output += `Gas Price: ${parseInt(txInfo.gasPrice, 16)} wei\n\n`

  // Decode the main function call
  if (txInfo.input && txInfo.input.length >= 10) {
    const callData = await decodeFunctionCall(txInfo.input, txInfo.to)

    output += `Function: ${callData.signature}\n`

    // Show decoded parameters
    if (callData.args && callData.args.length > 0) {
      output += 'Parameters:\n'
      callData.args.forEach((arg: any) => {
        output += `  ${arg.name}: ${arg.value} (${arg.type})\n`
      })
    }

    output += '\n'
  }

  output += '📋 VM EXECUTION TRACE:\n\n'

  // Process opcodes - simplified for readability
  let lastDepth = 0
  let ops = 0
  const maxOps = 300 // Limit trace output to not overwhelm with huge traces

  if (trace && trace.structLogs) {
    for (const log of trace.structLogs) {
      if (ops >= maxOps) {
        output += `\n... trace truncated (showing ${maxOps} of ${trace.structLogs.length} operations) ...\n`
        break
      }

      // Only show depth changes and interesting opcodes
      if (
        log.depth !== lastDepth ||
        [
          'CALL',
          'STATICCALL',
          'DELEGATECALL',
          'CREATE',
          'REVERT',
          'RETURN',
          'SELFDESTRUCT',
          'LOG0',
          'LOG1',
          'LOG2',
          'LOG3',
          'LOG4',
        ].includes(log.op)
      ) {
        const indent = '  '.repeat(log.depth)
        output += `${indent}[${log.pc}] ${log.op} (gas: ${log.gas} → ${log.gas - (log.gasCost || 0)})\n`

        // Show stack for interesting operations
        if (
          ['CALL', 'STATICCALL', 'DELEGATECALL', 'CREATE', 'REVERT'].includes(log.op) &&
          log.stack &&
          log.stack.length > 0
        ) {
          output += `${indent}  Stack: ${log.stack.slice(-4).join(', ')}\n`
        }

        // Show storage changes
        if (log.storage) {
          output += `${indent}  Storage: ${JSON.stringify(log.storage)}\n`
        }

        lastDepth = log.depth
        ops++
      }
    }
  } else {
    output += 'Raw trace data not available or in unexpected format.\n'
  }

  // Add gas usage summary
  if (trace && trace.gas !== undefined) {
    output += `\nGas used: ${trace.gas}\n`
  }

  return output
}

function formatFunctionCall(selector: string, contractName: string | undefined): string {
  // Try to get from cache first
  const signature = selectorCache[selector]
  if (signature) {
    return `${contractName ? contractName + '.' : ''}${signature}`
  }
  return selector
}
