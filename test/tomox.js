let chai = require('chai')
let should = chai.should()
let expect = chai.expect
let config = require('config')
let urljoin = require('url-join')
let TomoJS = require('tomojs')
let rpc = (config.rpc || {})

const sleep = ms => new Promise(res => setTimeout(res, ms))

describe('TomoX testcases', () => {
    if (!rpc) {
        return
    }

    let A = TomoJS.randomWallet() // Trader B
    let B = TomoJS.randomWallet() // Trader A

    let C = TomoJS.randomWallet() // Relayer Coinbase

    let O = TomoJS.randomWallet() // Relayer Owner

    let I = TomoJS.randomWallet() // Issuer

    let tomojsO = await TomoJS.setProvider(rpc, O.privateKey)

    let tomojsI = await TomoJS.setProvider(rpc, I.privateKey)

    let tomojsR = await TomoJS.setProvider(rpc, config.rootWalletPkey)

    let tomojsA = await TomoJS.setProvider(rpc, A.privateKey)

    let tomojsB = await TomoJS.setProvider(rpc, B.privateKey)


    console.log('Distributing TOMO ...')

    let nonce = await tomojsR.wallet.getTransactionCount()
    await tomojsR.send({ address: tomojsO.coinbase, value: '100000', nonce: nonce })
    await tomojsR.send({ address: tomojsA.coinbase, value: '1000', nonce: nonce + 1 })
    await tomojsR.send({ address: tomojsB.coinbase, value: '1000', nonce: nonce + 2 })
    await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 3 })

    await sleep(5000)
    console.log(`Registering relayer ${C.address}...`)

    await tomojsO.tomox.register({
        amount: 25000,
        node: C.address,
        tradeFee: 0.1,
        baseTokens: [ '0x0000000000000000000000000000000000000001' ],
        quoteTokens: [ '0x9839B789b09292c175Cc7173337520fE8fd9d8FE' ]
    })

    await sleep(5000)
    console.log(`Issue/ApplyTomoX token...`)

    nonce = await tomojsI.wallet.getTransactionCount()
    let token = await tomojsI.tomoz.issueTRC21({
        name: 'TEST',
        symbol: 'TEST',
        totalSupply: '100000',
        decimals: 18,
        nonce: nonce
    })

    await tomojsI.tomoz.applyTomoX({
        tokenAddress: token.contractAddress,
        amount: 1000,
        nonce: nonce + 1
    })

    await sleep(5000)
    console.log(`List token...`)

    await tomojsO.tomox.list({
        node: C.address,
        baseToken: token.contractAddress,
        quoteToken: '0x0000000000000000000000000000000000000001'
    })

    await sleep(5000)
    console.log('Distributing TRC21...')

    await tomojsI.tomoz.transfer({
        tokenAddress: token.contractAddress,
        to: A.address,
        amount: 1000
    })

    await sleep(5000)

    describe(`Test spot trading orderbook and trades`, () => {
        it(`it should match with good `, async () => {

            console.log(`Trading ...`)

            try {
                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.11,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.1,
                    side: 'SELL',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 1
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.1,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.09,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 1
                })

                await sleep(5000)

                let bids = await tomojsR.tomox.getBids( token.contractAddress, '0x0000000000000000000000000000000000000001' )
                let asks = await tomojsR.tomox.getAsks( token.contractAddress, '0x0000000000000000000000000000000000000001' )
                expect(bids).to.equal({ '90000000000000000': 100000000000000000000 })
                expect(asks).to.equal({ '110000000000000000': 100000000000000000000 })

                await sleep(5000)
                let bA = await tomojsA.getBalance()
                let bB = await tomojsB.getBalance()
                expect(bA.toString()).to.equal('1009.99')
                expect(bB.toString()).to.equal('989.99')

                let bTA = await tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })
                let bTB = await tomojsB.tomoz.balanceOf({ tokenAddress: token.contractAddress })
                expect(bTA.balance.toString()).to.equal('900')
                expect(bTB.balance.toString()).to.equal('100')

            } catch (e) {
                console.log(e)
            }

            expect(1).to.equal(1)
        })
    })
})
