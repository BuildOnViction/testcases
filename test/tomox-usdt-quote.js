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
    Test pair TOMO/USDT
    Steps:
    - Create a relayer
    - Issue token
    - Create BUY/SELL orders
    - Matched
    `, async () => {
        
        it(`it should work`, async () => {

            try {
                let tomoNative = '0x0000000000000000000000000000000000000001'
                let tradeFee = 0.1
                let tradeMatchedPrice = 0.38
                let tokenDecimals = 6
                let amount = 100

                let A = TomoJS.randomWallet() // Trader A


                let B = TomoJS.randomWallet() // Trader B 

                let C = TomoJS.randomWallet() // Relayer Coinbase

                let O = TomoJS.randomWallet() // Relayer Owner

                let I = TomoJS.randomWallet() // Issuer

                let tomojsO = await TomoJS.setProvider(rpc, O.privateKey)

                let tomojsI = await TomoJS.setProvider(rpc, I.privateKey)

                let tomojsR = await TomoJS.setProvider(rpc, config.rootWalletPkey)
                let tomojsM = await TomoJS.setProvider(rpc, config.mainWalletPkey)

                let tomojsA = await TomoJS.setProvider(rpc, A.privateKey)

                let tomojsB = await TomoJS.setProvider(rpc, B.privateKey)



                console.log('Distributing TOMO ...')

                let nonce = await tomojsR.wallet.getTransactionCount()
                await tomojsR.send({ address: tomojsO.coinbase, value: '100000', nonce: nonce })
                await tomojsR.send({ address: tomojsA.coinbase, value: '1000', nonce: nonce + 1 })
                await tomojsR.send({ address: tomojsB.coinbase, value: '1000', nonce: nonce + 2 })
                await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 3 })

                await sleep(5000)
                console.log(`Issue/ApplyTomoX token...`)

                let token = await tomojsI.tomoz.issueTRC21({
                    name: 'USDT',
                    symbol: 'USDT',
                    totalSupply: '100000',
                    decimals: tokenDecimals,
                    nonce: 0
                })

                await tomojsI.tomoz.applyTomoX({
                    tokenAddress: token.contractAddress,
                    amount: 1000,
                    nonce: 1
                })

                await sleep(5000)
                console.log(`Registering relayer ${C.address}...`)

                let baseToken = tomoNative
                let quoteToken = token.contractAddress
                await tomojsO.tomox.register({
                    amount: 25000,
                    node: C.address,
                    tradeFee: tradeFee,
                    baseTokens: [ baseToken ],
                    quoteTokens: [ quoteToken ],
                    nonce: 0
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
                    to: B.address,
                    amount: 1000,
                    nonce: 3
                })

                await sleep(5000)

                let step0OwnerTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).multipliedBy(10 ** tokenDecimals)

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 0: wrong Relayer Owner TOMO balance')
                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('25000000000000000000000', 'Step 0: wrong Relayer Deposit')

                console.log(`Trading ...`)

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tradeMatchedPrice,
                    side: 'BUY',
                    amount: amount,
                    quoteToken: quoteToken,
                    baseToken: baseToken,
                    nonce: 0
                })

                await sleep(5000)

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tradeMatchedPrice,
                    side: 'SELL',
                    amount: amount,
                    quoteToken: quoteToken,
                    baseToken: baseToken,
                    nonce: 0
                })


                await sleep(5000)

                let relayer = tomojsO.tomox.getRelayerByAddress(C.address)
                let bA = tomojsA.getBalance()
                let bB = tomojsB.getBalance()
                let bTA = tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })
                let bTB = tomojsB.tomoz.balanceOf({ tokenAddress: token.contractAddress })

                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('24999998000000000000000', 'Step 1: wrong Relayer Deposit')

                let step1OwnerTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).multipliedBy(10 ** tokenDecimals)

                expect(step1OwnerTokenBalance.minus(step0OwnerTokenBalance).dividedBy(10 ** tokenDecimals).toString(10)).to.equal((new BigNumber(tradeMatchedPrice)).multipliedBy(amount).multipliedBy(2).multipliedBy(tradeFee).dividedBy(100).toString(10), 'Step 1: wrong owner USDT balance')

            } catch (e) {
                console.log(e)
            }
        })
    })
})
