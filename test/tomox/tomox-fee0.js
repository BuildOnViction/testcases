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
    Test general cases with trade fee, lending fee is zero
    Steps:
    - Create a relayer
    - Issue Token
    - Create lending, trading orders
    - Matched
    - Cancel lending, trading order
    - Manually Topup
    - Manually Repay
    `, async () => {
        
        it(`It should work`, async () => {

            try {
                let term = 86400
                let tomoNative = '0x0000000000000000000000000000000000000001'
                let lockAddress= '0x0000000000000000000000000000000000000011'
                let tradeFee = 0
                let lendFee = 0
                let tradeMatchedPrice = 0.1

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
                    tradeFee: tradeFee,
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
                    price: new BigNumber(10).multipliedBy(1e18).toString(10),
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: lendFee,
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

                let step0OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)
                let step0LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)

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

                console.log(`Lending ...`)
                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 8.5,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 1
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 10,
                    quantity: 1000,
                    side: 'INVEST',
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

                let borrows = tomojsR.tomox.getBorrows( token.contractAddress, term )
                let invests = tomojsR.tomox.getInvests( token.contractAddress, term )

                let step1LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)

                expect(step1LockAddressTOMOBalance.minus(step0LockAddressTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal('150', 'Step 1: wrong lock lending TOMO balance')

                let step1OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)

                expect(step1OwnerTOMOBalance.minus(step0OwnerTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal(String(tradeMatchedPrice * 100 * 2 * tradeFee / 100), 'Step 1: wrong owner TOMO balance')

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal(String(0.1 * 1000 * lendFee / 100), 'Step 1: wrong owner Token balance')

                expect((await borrows)['850000000'].toString(10)).to.equal('1e+21', 'Step 1: wrong borrows orderbook')
                expect((await invests)['1000000000'].toString(10)).to.equal('1e+21', 'Step 1: wrong borrows orderbook')

                expect((await bids)['90000000000000000']).to.equal(100000000000000000000, 'Step 1: wrong bid orderbook')
                expect((await asks)['110000000000000000']).to.equal(100000000000000000000, 'Step 1: wrong bid orderbook')

                expect(await tomojsLA.getBalance()).to.equal('0.0', 'Step 1: wrong lender TOMO balance')
                expect((await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('19000', 'Step 1: wrong lender token balance')

                expect(await tomojsLB.getBalance()).to.equal('9850.0', 'Step 1: wrong borrower TOMO balance')
                expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('1000', 'Step 1: wrong borrower TOMO balance')

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 1: wrong Relayer Owner TOMO balance')
                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('24999988000000000000000', 'Step 1: wrong Relayer Deposit')

                expect((await bA).toString()).to.equal('1010.0', 'Step 1: wrong seller TOMO balance')
                expect((await bTA).balance.toString()).to.equal('900', 'Step 1: rong seller token balance')

                expect((await bB).toString()).to.equal('990.0', 'Step 1: wrong buyer TOMO balance')
                expect((await bTB).balance.toString()).to.equal('100', 'Step 1: wrong buyer token balance')

                console.log('Cancel SELL order...')
                let orders = await tomojsA.tomox.getOrdersByAddress(token.contractAddress, tomoNative)
                await tomojsA.tomox.cancelOrder({
                    exchangeAddress: C.address,
                    baseToken: orders[0].baseToken,
                    quoteToken: orders[0].quoteToken,
                    orderHash: orders[0].hash,
                    orderId: orders[0].orderID
                })

                console.log('Cancel BUY order...')
                orders = await tomojsB.tomox.getOrdersByAddress(token.contractAddress, tomoNative)
                await tomojsB.tomox.cancelOrder({
                    exchangeAddress: C.address,
                    baseToken: orders[0].baseToken,
                    quoteToken: orders[0].quoteToken,
                    orderHash: orders[0].hash,
                    orderId: orders[0].orderID
                })

                console.log('Cancel BORROW order...')
                let lorders = await tomojsLB.tomox.getLendingOrdersByAddress(token.contractAddress, term)
                await tomojsLB.tomox.cancelLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: lorders[0].lendingToken,
                    term: lorders[0].term,
                    interest: lorders[0].interest,
                    lendingId: lorders[0].lendingId,
                    hash: lorders[0].hash
                })

                console.log('Cancel INVEST order...')
                lorders = await tomojsLA.tomox.getLendingOrdersByAddress(token.contractAddress, term)
                await tomojsLA.tomox.cancelLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: lorders[0].lendingToken,
                    term: lorders[0].term,
                    interest: lorders[0].interest,
                    lendingId: lorders[0].lendingId,
                    hash: lorders[0].hash
                })

                await sleep(5000)
                expect(await tomojsA.getBalance()).to.equal('1010.0', 'Step 2: wrong seller TOMO balnce')
                expect((await tomojsA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('900', 'Step 2: wrong seller token balance')

                expect(await tomojsB.getBalance()).to.equal('990.0', 'Step 2: wrong buyer TOMO balnce')
                expect((await tomojsB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('100', 'Step 2: wrong buyer token balance')

                expect(await tomojsLA.getBalance()).to.equal('0.0', 'Step 2: wrong lender TOMO balance')
                expect((await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('19000', 'Step 2: wrong lender token balance')

                expect(await tomojsLB.getBalance()).to.equal('9850.0', 'Step 2: wrong borrower TOMO balance')
                expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('1000', 'Step 2: wrong borrower token balance')

            } catch (e) {
                console.log(e)
            }
        })
    })
})
