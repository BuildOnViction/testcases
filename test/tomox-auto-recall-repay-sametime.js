let chai = require('chai')
let should = chai.should()
let expect = chai.expect
let config = require('config')
let urljoin = require('url-join')
let TomoJS = require('tomojs')
let BigNumber = require('bignumber.js')
let rpc = (config.rpc || {})

const sleep = ms => new Promise(res => setTimeout(res, ms))

describe('TomoX testcases', () => {
    if (!rpc) {
        return
    }
    describe(`Test spot trading orderbook and trades`, async () => {
        
        it(`it should work`, async () => {

            try {

                let term = 60

                let A = TomoJS.randomWallet() // Trader A

                let LA = TomoJS.randomWallet() // Lender A

                let B = TomoJS.randomWallet() // Trader B 

                let LB = TomoJS.randomWallet() // Borrower B

                let C = TomoJS.randomWallet() // Relayer Coinbase

                let O = TomoJS.randomWallet() // Relayer Owner

                let I = TomoJS.randomWallet() // Issuer

                let tomojsO = await TomoJS.setProvider(rpc, O.privateKey)

                let tomojsI = await TomoJS.setProvider(rpc, I.privateKey)

                let tomojsR = await TomoJS.setProvider(rpc, config.rootWalletPkey)
                let tomojsM = await TomoJS.setProvider(rpc, config.mainWalletPkey)

                let tomojsA = await TomoJS.setProvider(rpc, A.privateKey)

                let tomojsB = await TomoJS.setProvider(rpc, B.privateKey)

                let tomojsLA = await TomoJS.setProvider(rpc, LA.privateKey)

                let tomojsLB = await TomoJS.setProvider(rpc, LB.privateKey)


                console.log('Distributing TOMO ...')

                let nonce = await tomojsR.wallet.getTransactionCount()
                await tomojsR.send({ address: tomojsO.coinbase, value: '100000', nonce: nonce })
                await tomojsR.send({ address: tomojsA.coinbase, value: '1000', nonce: nonce + 1 })
                await tomojsR.send({ address: tomojsB.coinbase, value: '1000', nonce: nonce + 2 })
                await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 3 })
                await tomojsR.send({ address: tomojsLB.coinbase, value: '10000', nonce: nonce + 4 })

                await sleep(5000)
                console.log(`Issue/ApplyTomoX token...`)

                let token = await tomojsI.tomoz.issueTRC21({
                    name: 'TEST',
                    symbol: 'TEST',
                    totalSupply: '100000',
                    decimals: 18,
                    nonce: 0
                })

                await tomojsI.tomoz.applyTomoX({
                    tokenAddress: token.contractAddress,
                    amount: 1000,
                    nonce: 1
                })

                await sleep(5000)
                console.log(`Registering relayer ${C.address}...`)

                await tomojsO.tomox.register({
                    amount: 25000,
                    node: C.address,
                    tradeFee: 0.1,
                    baseTokens: [ token.contractAddress ],
                    quoteTokens: [ '0x0000000000000000000000000000000000000001' ],
                    nonce: 0
                })

                console.log(`Add collateral ...`)
                nonce = await tomojsM.wallet.getTransactionCount()
                await tomojsM.tomox.addCollateral({
                    token: '0x0000000000000000000000000000000000000001',
                    depositRate: 150,
                    liquidationRate: 110,
                    recallRate: 200,
                    nonce: nonce
                })

                console.log(`Add lending token...`)
                await tomojsM.tomox.addLendingToken({
                    token: token.contractAddress,
                    nonce: nonce + 1
                })

                await sleep(5000)
                console.log(`Set collateral price...`)

                // Price TOMO/TEST
                await tomojsM.tomox.setCollateralPrice({
                    token: '0x0000000000000000000000000000000000000001',
                    lendingToken: token.contractAddress,
                    price: new BigNumber(10).multipliedBy(1e18).toString(10),
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: 1,
                    collateralTokens: [ '0x0000000000000000000000000000000000000000' ],
                    terms: [ term ],
                    lendingTokens: [ token.contractAddress ],
                    nonce: 1
                })

                await sleep(5000)
                console.log('Distributing TRC21...')

                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: A.address,
                    amount: 1000,
                    nonce: 2
                })

                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: LA.address,
                    amount: 20000,
                    nonce: 3
                })

                await sleep(5000)
                console.log(`Trading ...`)

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.01,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.01,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                console.log(`Lending ...`)
                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 0
                })

                await sleep(5000)

                console.log('Reset collateral price in contract ...')
                await tomojsM.tomox.setCollateralPrice({
                    token: '0x0000000000000000000000000000000000000001',
                    lendingToken: token.contractAddress,
                    price: new BigNumber(0).multipliedBy(1e18).toString(10)
                })

                await sleep(5000)
                console.log('Transfer TRC21 token ...')

                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: LB.address,
                    amount: 11
                })

                await sleep(5000)

                while(true) {
                    let blockNumber = parseInt(await tomojsM.tomo.getBlockNumber())
                    console.log('Waiting for the auto repay & recall happens', blockNumber, blockNumber % 900)
                    console.log('TOMO LB', await tomojsLB.getBalance())
                    console.log('Token LB', (await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance)

                    await sleep(5000)
                }


            } catch (e) {
                console.log(e)
            }
        })
    })
})
