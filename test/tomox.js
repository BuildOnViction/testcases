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

                await tomojsM.tomox.addCollateral({
                    token: token.contractAddress,
                    depositRate: 150,
                    liquidationRate: 110,
                    recallRate: 200,
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Set collateral price...`)

                // Price TOMO/TEST
                await tomojsM.tomox.setCollateralPrice({
                    token: '0x0000000000000000000000000000000000000001',
                    lendingToken: token.contractAddress,
                    price: new BigNumber(10).multipliedBy(1e18).toString(10),
                    nonce: nonce + 3
                })

                // Price TEST/TOMO
                await tomojsM.tomox.setCollateralPrice({
                    lendingToken: '0x0000000000000000000000000000000000000001',
                    token: token.contractAddress,
                    price: new BigNumber(0.1).multipliedBy(1e18).toString(10),
                    nonce: nonce + 4
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: 1,
                    collateralTokens: [ '0x0000000000000000000000000000000000000000' ],
                    terms: [ 60 ],
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
                    price: 0.09,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 0
                })

                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.1,
                    side: 'BUY',
                    amount: 100,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress,
                    nonce: 1
                })

                console.log(`Lending ...`)
                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    interest: 8.5,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    interest: 9,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 1
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    interest: 9,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    interest: 10,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 1
                })

                await sleep(5000)

                let relayer = tomojsO.tomox.getRelayerByAddress(C.address)
                let bA = tomojsA.getBalance()
                let bB = tomojsB.getBalance()
                let bO = tomojsO.getBalance()
                let bTA = tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })
                let bTB = tomojsB.tomoz.balanceOf({ tokenAddress: token.contractAddress })

                let bids = tomojsR.tomox.getBids( token.contractAddress, '0x0000000000000000000000000000000000000001' )
                let asks = tomojsR.tomox.getAsks( token.contractAddress, '0x0000000000000000000000000000000000000001' )

                let borrows = tomojsR.tomox.getBorrows( token.contractAddress, 60 )
                let invests = tomojsR.tomox.getInvests( token.contractAddress, 60 )

                // expect((await relayer).deposit).to.equal('24999998000000000000000')
                console.log('relayer', (await relayer).deposit)
                console.log('bO', (await bO).toString())
                console.log('borrows', await borrows)
                console.log('invests', await invests)

                console.log('TOMO LA', await tomojsLA.getBalance())
                console.log('TOMO LB', await tomojsLB.getBalance())
                console.log('Token LA', await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress }))
                console.log('Token LB',await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress }))

                expect((await bids)['90000000000000000']).to.equal(100000000000000000000)
                expect((await asks)['110000000000000000']).to.equal(100000000000000000000)

                expect((await bA).toString()).to.equal('1009.99')
                expect((await bB).toString()).to.equal('989.99')

                expect((await bTA).balance.toString()).to.equal('900')
                expect((await bTB).balance.toString()).to.equal('100')

                console.log('Cancel SELL order...')
                let orders = await tomojsA.tomox.getOrdersByAddress(token.contractAddress, '0x0000000000000000000000000000000000000001')
                await tomojsA.tomox.cancelOrder({
                    exchangeAddress: C.address,
                    baseToken: orders[0].baseToken,
                    quoteToken: orders[0].quoteToken,
                    orderHash: orders[0].hash,
                    orderId: orders[0].orderID
                })

                console.log('Cancel BUY order...')
                orders = await tomojsB.tomox.getOrdersByAddress(token.contractAddress, '0x0000000000000000000000000000000000000001')
                await tomojsB.tomox.cancelOrder({
                    exchangeAddress: C.address,
                    baseToken: orders[0].baseToken,
                    quoteToken: orders[0].quoteToken,
                    orderHash: orders[0].hash,
                    orderId: orders[0].orderID
                })

                console.log('Cancel BORROW order...')
                let lorders = await tomojsLB.tomox.getLendingOrdersByAddress(token.contractAddress, 60)
                await tomojsLB.tomox.cancelLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: lorders[0].lendingToken,
                    term: lorders[0].term,
                    interest: lorders[0].interest,
                    lendingId: lorders[0].lendingId,
                    hash: lorders[0].hash
                })

                console.log('Cancel INVEST order...')
                lorders = await tomojsLA.tomox.getLendingOrdersByAddress(token.contractAddress, 60)
                await tomojsLA.tomox.cancelLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: lorders[0].lendingToken,
                    term: lorders[0].term,
                    interest: lorders[0].interest,
                    lendingId: lorders[0].lendingId,
                    hash: lorders[0].hash
                })

                await sleep(5000)
                expect(await tomojsA.getBalance()).to.equal('1009.99')
                expect((await tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('899.99')

                console.log(await tomojsB.getBalance())
                console.log(await tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress }))

                console.log('TOMO LA', await tomojsLA.getBalance())
                console.log('Token LA', await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress }))
                console.log('TOMO LB', await tomojsLB.getBalance())
                console.log('Token LB', await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress }))

                let lendingTrades = await tomojsR.tomox.getLendingTradesByAddress(token.contractAddress, 60, tomojsLB.coinbase)

                console.log('Topup lending trade ...')
                await tomojsLB.tomox.topupLendingTrade({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    quantity: 10,
                    tradeId: lendingTrades[0].tradeId
                })

                await sleep(5000)

                console.log('TOMO LA', await tomojsLA.getBalance())
                console.log('TOMO LB', await tomojsLB.getBalance())
                console.log('Token LA', await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress }))
                console.log('Token LB',await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress }))

                console.log('Transfer TRC21 token ...')
                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: LB.address,
                    amount: 11
                })

                await sleep(5000)
                console.log('Repay lending trade ...')
                await tomojsLB.tomox.repayLendingTrade({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: '0x0000000000000000000000000000000000000001',
                    term: 60,
                    tradeId: lendingTrades[0].tradeId
                })

                await sleep(5000)
                console.log('TOMO LA', await tomojsLA.getBalance())
                console.log('TOMO LB', await tomojsLB.getBalance())
                console.log('Token LA', await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress }))
                console.log('Token LB',await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress }))


            } catch (e) {
                console.log(e)
            }
        })
    })
})
