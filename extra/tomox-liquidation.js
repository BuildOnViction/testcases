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
    describe(`
    Test liquidation by the term finished
    Steps:
    - Create a relayer
    - Issue Token
    - Create lending, trading orders
    - Matched
    - Liquidation by the term finished
    `, async () => {
        
        it(`it should work`, async () => {

            try {

                let term = 60
                let tokenPriceStep1 = 10
                let tokenPriceStep2 = 20
                let lockAddress= '0x0000000000000000000000000000000000000011'
                let tomoNative= '0x0000000000000000000000000000000000000001'
                let loanAmount = 1000

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
                    quoteTokens: [ tomoNative ],
                    nonce: 0
                })

                console.log(`Add collateral ...`)
                nonce = await tomojsM.wallet.getTransactionCount()
                await tomojsM.tomox.addCollateral({
                    token: tomoNative,
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
                    token: tomoNative,
                    lendingToken: token.contractAddress,
                    price: new BigNumber(tokenPriceStep1).multipliedBy(1e18).toString(10),
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

                let step0LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)

                await sleep(5000)
                console.log(`Trading ...`)

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 1 / tokenPriceStep2,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 1 / tokenPriceStep2,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await sleep(5000)
                console.log(`Lending ...`)
                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: loanAmount,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: loanAmount,
                    side: 'INVEST',
                    nonce: 0
                })

                await sleep(5000)

                console.log('Reset new collateral price in contract ...')
                await tomojsM.tomox.setCollateralPrice({
                    token: tomoNative,
                    lendingToken: token.contractAddress,
                    price: new BigNumber(0).multipliedBy(1e18).toString(10)
                })

                await sleep(5000)

                let step1LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)
                expect(step1LockAddressTOMOBalance.minus(step0LockAddressTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal('150', 'Step 1: wrong lock lending TOMO balance')

                let blockNumber = parseInt(await tomojsM.tomo.getBlockNumber())
                let liqBlockNumber = 100 + ((Math.floor( blockNumber / 900 ) + 1) * 900)

                while(true) {
                    blockNumber = parseInt(await tomojsM.tomo.getBlockNumber())
                    console.log('Waiting for the liquidation happens at', liqBlockNumber, 'current block', blockNumber)
                    if (liqBlockNumber < blockNumber ) {
                        let repayAmount = loanAmount * 110 / 100 / tokenPriceStep2
                        let recallAmount = 150 - repayAmount

                        expect(Math.ceil(parseFloat(await tomojsLB.getBalance()))).to.equal(9850 + recallAmount, 'Wrong borrower TOMO balance')
                        expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('990', 'Wrong borrower token balance')

                        let step2LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)
                        expect(step1LockAddressTOMOBalance.minus(step2LockAddressTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal('150', 'Step 1: wrong lock lending TOMO balance')

                        break
                    }
                    await sleep(5000)
                }


            } catch (e) {
                console.log(e)
            }
        })
    })
})
