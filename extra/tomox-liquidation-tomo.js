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
    Test liquidation by the term finished - TOMO lending token
    Steps:
    - Create a relayer
    - Issue Token
    - Create lending, trading orders
    - Matched
    - Liquidation by the term finished
    `, async () => {
        
        it(`it should work`, async () => {

            try {

                let term = 65
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
                await tomojsR.send({ address: tomojsA.coinbase, value: '10000', nonce: nonce + 1 })
                await tomojsR.send({ address: tomojsB.coinbase, value: '10000', nonce: nonce + 2 })
                await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 3 })
                await tomojsR.send({ address: tomojsLA.coinbase, value: '20000', nonce: nonce + 4 })

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
                    token: token.contractAddress,
                    depositRate: 150,
                    liquidationRate: 110,
                    recallRate: 200,
                    nonce: nonce
                })

                console.log(`Add lending token...`)
                await tomojsM.tomox.addLendingToken({
                    token: tomoNative,
                    nonce: nonce + 1
                })

                console.log(`Add term...`)
                await tomojsM.tomox.addTerm({
                    term: term,
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Set collateral price...`)

                // Price TOMO/TEST
                await tomojsM.tomox.setCollateralPrice({
                    token: token.contractAddress,
                    lendingToken: tomoNative,
                    price: new BigNumber(tokenPriceStep1).multipliedBy(1e18).toString(10),
                    nonce: nonce + 3
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: 1,
                    collateralTokens: [ '0x0000000000000000000000000000000000000000' ],
                    terms: [ term ],
                    lendingTokens: [ tomoNative ],
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
                    to: LB.address,
                    amount: 10000,
                    nonce: 3
                })

                let step0LockAddressTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress, userAddress: lockAddress })).balanceBig)

                await sleep(5000)
                console.log(`Trading ...`)

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tokenPriceStep2,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tokenPriceStep2,
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
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 9,
                    quantity: loanAmount,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 9,
                    quantity: loanAmount,
                    side: 'INVEST',
                    nonce: 0
                })

                await sleep(5000)

                console.log('Reset new collateral price in contract ...')
                await tomojsM.tomox.setCollateralPrice({
                    token: token.contractAddress,
                    lendingToken: tomoNative,
                    price: new BigNumber(0).multipliedBy(1e18).toString(10)
                })

                await sleep(5000)

                let step1LockAddressTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress, userAddress: lockAddress })).balanceBig)
                expect(step1LockAddressTokenBalance.minus(step0LockAddressTokenBalance).dividedBy(1e18).toString(10)).to.equal('150', 'Step 1: wrong lock lending Token balance')
                expect(await tomojsLB.getBalance()).to.equal('990.0', 'Wrong borrower TOMO balance')
                expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal(String(10000 - 150), 'Wrong borrower token balance')

                let blockNumber = parseInt(await tomojsM.tomo.getBlockNumber())
                let liqBlockNumber = 100 + ((Math.floor( blockNumber / 900 ) + 1) * 900)

                while(true) {
                    blockNumber = parseInt(await tomojsM.tomo.getBlockNumber())
                    console.log('Waiting for the liquidation happens at', liqBlockNumber, 'current block', blockNumber)
                    if (liqBlockNumber < blockNumber ) {
                        let repayAmount = loanAmount * 110 / 100 / tokenPriceStep2
                        let recallAmount = 150 - repayAmount

                        expect(Math.ceil(parseFloat((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance))).to.equal(9850 + recallAmount, 'Wrong borrower token balance')
                        expect(await tomojsLB.getBalance()).to.equal('990.0', 'Wrong borrower TOMO balance')

                        let step2LockAddressTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress, userAddress: lockAddress }).balanceBig))
                        expect(step1LockAddressTokenBalance.minus(step2LockAddressTokenBalance).dividedBy(10 ** 18).toString(10)).to.equal('150', 'Step 1: wrong lock lending token balance')

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
