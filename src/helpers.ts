import fetch from 'node-fetch'
import {API_URL, DEBUG} from './constants.js'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'

// Contract data cache to avoid repeated API calls
const contractCache = new Map()

// Implementation address cache for proxy contracts
const implementationCache = new Map()

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
    if(DEBUG) console.log('API_URL is not set')
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
    if(DEBUG) console.log(`Fetching contract data for ${address}`, {address})

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
      if(DEBUG) console.log(`Trying URL`, {url: url.toString()})

      // Fetch the contract data
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      if(DEBUG) console.log(`Response status`, {status: response.status})

      if (response.ok) {
        responseOk = true
        // Parse the response
        const data = (await response.json()) as any
        if(DEBUG) console.log(`Got response`, {keys: Object.keys(data)})

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
                if(DEBUG) console.log(`Added function`, {name: item.name, selector})
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
      if(DEBUG) console.log(`Error with endpoint`, {endpoint, error: error.message})
      // Continue to next endpoint
    }

    if (contractData) {
      contractCache.set(address, contractData)
      return contractData
    }

    if (!responseOk) {
      if(DEBUG) console.log(`All endpoints failed`, {address})
    } else {
      if(DEBUG) console.log(`No ABI found`, {address})
    }

    // No ABI found
    contractCache.set(address, null)
    return null
  } catch (error: any) {
    if(DEBUG) console.log(`Error fetching contract data`, {address, error: error.message})
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
 * Get implementation address for a proxy contract
 * @param {string} proxyAddress - Proxy contract address 
 * @returns {Promise<string|null>} - Implementation address or null
 */
async function getImplementationAddress(proxyAddress: string): Promise<string|null> {
  if (implementationCache.has(proxyAddress)) {
    return implementationCache.get(proxyAddress)
  }

  const contractData = await fetchContractData(proxyAddress)
  if (!contractData) return null

  // Check if contract has implementations field
  if (contractData.implementations && contractData.implementations.length > 0) {
    const impl = contractData.implementations[0]
    implementationCache.set(proxyAddress, impl)
    return impl
  }

  return null
}

/**
 * Try to get function information for a given call
 * @param {string} callData - Function call data
 * @param {string} address - Contract address
 * @param {boolean} isDelegate - Whether this is a delegate call
 * @returns {Promise<any>} - Function info including decoded params
 */
export async function decodeFunctionCall(callData: string, address: string, isDelegate: boolean = false): Promise<any> {
  if (!callData || callData.length < 10) {
    return {name: 'unknown', signature: 'unknown()', args: []}
  }

  const selector = callData.slice(0, 10).toLowerCase()
  if(DEBUG) console.log(`Decoding function call`, {selector, address, isDelegate})

  // Try to get contract data
  let contractData = await fetchContractData(address)
  let contractAddress = address

  // If this is a proxy contract and we're doing a delegate call
  if (isDelegate) {
    const implAddress = await getImplementationAddress(address)
    if (implAddress) {
      const implData = await fetchContractData(implAddress)
      if (implData) {
        contractData = implData
        contractAddress = implAddress
      }
    }
  }

  if (contractData) {
    if(DEBUG) console.log(`Contract data found`, {name: contractData.name, address: contractAddress})
    if(DEBUG) console.log(`Available function selectors`, {selectors: Object.keys(contractData.functionsBySelector || {})})
  } else {
    if(DEBUG) console.log(`No contract data found`, {address: contractAddress})
  }

  if (contractData?.functionsBySelector && contractData.functionsBySelector[selector]) {
    // We have the full function definition from ABI
    const funcInfo = contractData.functionsBySelector[selector]
    if(DEBUG) console.log(`Found function definition`, {selector, name: funcInfo.name})

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

  // If we can't decode it, just return the selector
  return {
    name: selector,
    signature: selector,
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
    const decoded = decodeParameters(outputData, funcInfo.outputs || [])
    
    // Convert to simplified format
    const simplified: Record<string, any> = {}
    for (const param of decoded) {
      if (param.type.endsWith('[]')) {
        // Handle array types
        const arrayData = param.value.startsWith('0x') ? param.value.slice(2) : param.value
        const offset = parseInt(arrayData.slice(0, 64), 16) * 2 // Convert byte offset to hex offset
        const length = parseInt(arrayData.slice(offset, offset + 64), 16)
        const values = []
        
        // Read array values
        for (let i = 0; i < length; i++) {
          const start = offset + 64 + (i * 64)
          const value = arrayData.slice(start, start + 64)
          if (param.type.startsWith('address')) {
            values.push('0x' + value.slice(-40))
          } else if (param.type.startsWith('uint')) {
            values.push(BigInt('0x' + value).toString())
          } else {
            values.push('0x' + value)
          }
        }
        simplified[param.name] = values
      } else {
        simplified[param.name] = param.value
      }
    }
    return simplified
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
  // Remove 0x prefix if present
  data = data.startsWith('0x') ? data.slice(2) : data

  // Each parameter takes 32 bytes (64 hex chars)
  const values: string[] = []
  for (let i = 0; i < data.length; i += 64) {
    values.push(data.slice(i, i + 64))
  }

  return types.map((param, index) => {
    const name = param.name || `param${index}`
    const type = param.type
    const value = values[index] || ''

    if (type === 'address') {
      // For addresses, take last 20 bytes (40 chars)
      return {
        name,
        value: '0x' + value.slice(-40),
        type
      }
    } else if (type.startsWith('uint')) {
      // For uints, convert from hex to decimal
      try {
        const decimal = BigInt('0x' + value).toString()
        return {
          name,
          value: decimal,
          type
        }
      } catch (e) {
        return {
          name,
          value: '0',
          type
        }
      }
    } else if (type === 'bool') {
      // For bools, check if last byte is 1
      return {
        name,
        value: value.slice(-1) === '1',
        type
      }
    } else if (type.startsWith('bytes')) {
      // For fixed bytes, take the required number of bytes
      const size = parseInt(type.slice(5)) || 32
      return {
        name,
        value: '0x' + value.slice(0, size * 2),
        type
      }
    } else {
      // For other types (arrays, strings, etc), just show hex
      return {
        name,
        value: '0x' + value,
        type
      }
    }
  })
}

/**
 * Format gas values to be human readable
 * @param {string} gas - Gas value in hex
 * @returns {string} - Formatted gas value
 */
function formatGas(gas: string): string {
  return gas ? `${parseInt(gas, 16).toLocaleString()} gas` : ''
}

/**
 * Format hex value to be human readable
 * @param {string} hex - Hex value
 * @returns {string} - Decoded value
 */
function formatHexValue(hex: string): string {
  if (!hex || !hex.startsWith('0x')) return hex
  
  // Remove leading zeros
  const cleaned = hex.replace(/^0x0*/, '0x')
  
  // If it's a number, show decimal
  try {
    const decimal = BigInt(hex).toString()
    return decimal
  } catch {
    // If not a valid number, return the full hex
    return cleaned.toLowerCase()
  }
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
  output += `From: ${txInfo.from.toLowerCase()}\n`
  output += `To: ${txInfo.to.toLowerCase()}\n`
  const valueInWei = BigInt(txInfo.value || '0')
  const valueInEth = Number(valueInWei) / 1e18
  output += `Value: ${valueInWei.toString()} wei (${valueInEth} ETH)\n`
  output += `Gas Limit: ${parseInt(txInfo.gas).toLocaleString()}\n`
  output += `Gas Price: ${parseInt(txInfo.gasPrice).toLocaleString()} wei\n\n`

  // Get contract data and decode initial function call
  const contractData = await fetchContractData(txInfo.to)
  const initialFuncCall = await decodeFunctionCall(txInfo.input, txInfo.to)
  const initialFunc = formatFunctionCallWithArgs(initialFuncCall)
  output += `Initial Call: ${initialFunc}\n\n`

  output += '📋 EXECUTION TRACE:\n\n'

  // Format the trace recursively
  async function formatTrace(trace: any, depth: number = 0): Promise<string> {
    const indent = '  '.repeat(depth)
    let result = ''

    // Get contract data for both from and to addresses
    const toContractData = await fetchContractData(trace.to)
    const fromContractData = trace.from ? await fetchContractData(trace.from) : null

    // Get identifiers (name or address)
    const toIdentifier = toContractData?.name ? toContractData.name : trace.to.toLowerCase()
    const fromIdentifier = fromContractData?.name ? fromContractData.name : (depth === 0 ? 'Caller' : trace.from?.toLowerCase() || '0x')

    // Decode function call - pass isDelegate flag for DELEGATECALL
    const isDelegate = trace.type === 'DELEGATECALL'
    const funcCall = await decodeFunctionCall(trace.input || '0x', trace.to, isDelegate)
    const funcDisplay = formatFunctionCallWithArgs(funcCall)
    
    // Format the call
    const callType = trace.type || 'CALL'
    result += `${indent}${callType} from ${fromIdentifier} to ${toIdentifier}`
    if (funcDisplay) {
      result += ` [${funcDisplay}]`
    }
    if (trace.gas || trace.gasUsed) {
      const gasUsed = trace.gasUsed ? ` → ${formatGas(trace.gasUsed)}` : ''
      result += ` (${formatGas(trace.gas)}${gasUsed})`
    }
    result += '\n'

    // Format output if present
    if (trace.output && trace.output !== '0x') {
      const decodedOutput = await decodeFunctionOutput(trace.output, funcCall.rawSelector, trace.to)
      if (decodedOutput) {
        result += `${indent}📤 Output: ${JSON.stringify(decodedOutput)}\n`
      } else {
        // For non-decodable output, show the full hex value
        result += `${indent}📤 Output: ${trace.output.toLowerCase()}\n`
      }
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
 * Format function call with decoded arguments
 * @param {any} funcCall - Decoded function call
 * @returns {string} - Formatted function call with args
 */
function formatFunctionCallWithArgs(funcCall: any): string {
  if (!funcCall || !funcCall.name) return ''
  
  // If we have decoded arguments, format them
  if (funcCall.args && funcCall.args.length > 0) {
    // Add parameter names if available
    const namedArgs = funcCall.args.map((arg: any) => 
      arg.name ? `${arg.name}: ${arg.value}` : arg.value.toString()
    ).join(', ')
    
    return `${funcCall.name}(${namedArgs})`
  }
  
  // Fallback to just the signature if no args
  return funcCall.signature || funcCall.name
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
