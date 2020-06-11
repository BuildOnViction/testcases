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
                let tomoNative = '0x0000000000000000000000000000000000000001'
                let tradeFee = 0.1
                let tradeMatchedPrice = 0.1

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
                    tradeFee: tradeFee,
                    baseTokens: [ token.contractAddress ],
                    quoteTokens: [ tomoNative ],
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

                await sleep(5000)

                let step0OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 0: wrong Relayer Owner TOMO balance')
                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('25000000000000000000000', 'Step 0: wrong Relayer Deposit')

                console.log(`Trading ...`)

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.11,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tradeMatchedPrice,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 1
                })

                await sleep(5000)

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.09,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: tradeMatchedPrice,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: tomoNative,
                    baseToken: token.contractAddress,
                    nonce: 1
                })

                await sleep(5000)

                let relayer = tomojsO.tomox.getRelayerByAddress(C.address)
                let bA = tomojsA.getBalance()
                let bB = tomojsB.getBalance()
                let bTA = tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })
                let bTB = tomojsB.tomoz.balanceOf({ tokenAddress: token.contractAddress })

                let bids = tomojsR.tomox.getBids( token.contractAddress, tomoNative )
                let asks = tomojsR.tomox.getAsks( token.contractAddress, tomoNative )


                let step1OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)

                expect(step1OwnerTOMOBalance.minus(step0OwnerTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal(String(tradeMatchedPrice * 100 * 2 * tradeFee / 100), 'Step 1: wrong owner TOMO balance')

                expect((await bids)['90000000000000000']).to.equal(100000000000000000000, 'Step 1: wrong bid orderbook')
                expect((await asks)['110000000000000000']).to.equal(100000000000000000000, 'Step 1: wrong bid orderbook')

                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('24999998000000000000000', 'Step 1: wrong Relayer Deposit')

                expect((await bA).toString()).to.equal('1009.99', 'Step 1: wrong seller TOMO balance')
                expect((await bTA).balance.toString()).to.equal('900', 'Step 1: rong seller token balance')

                expect((await bB).toString()).to.equal('989.99', 'Step 1: wrong buyer TOMO balance')
                expect((await bTB).balance.toString()).to.equal('100', 'Step 1: wrong buyer token balance')

            } catch (e) {
                console.log(e)
            }
        })
    })
})
