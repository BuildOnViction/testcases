const chai = require('chai')
const should = chai.should()
const expect = chai.expect
const config = require('config')
const BigNumber = require('bignumber.js')
const urljoin = require('url-join')
const ethers = require('ethers')
const axios = require('axios')
const usdtAbi = require('../abis/UsdtAbi.json')
const wrapperAbi = require('../abis/WrapperAbi.json')

let wallet, senderWallet
let address, senderAddress
let provider, senderProvider
let depositAddress
let usdtContract, wrapperContract
let depositAmount = new BigNumber(2).multipliedBy(10 ** config.get('bridge.usdt.decimals')).toString(10) // 2 usdt

const sleep = m => new Promise(res => setTimeout(res, m))

const string2bytes = str => {
    let byteArray = []
    for (let j = 0; j < str.length; j++) {
        byteArray.push(str.charCodeAt(j))
    }

    return byteArray
}

describe.skip('USDT workflow', () => {
    before(function () {
        provider = new ethers.providers.JsonRpcProvider(config.get('bridge.blockchain.tomoRpc'))
        senderProvider = new ethers.providers.JsonRpcProvider(config.get('bridge.blockchain.ethRpc'))
        wallet = new ethers.Wallet(config.get('bridge.receiverPk'), provider)
        senderWallet = new ethers.Wallet(config.get('bridge.senderUSDTPk'), senderProvider)
        address = wallet.address
        senderAddress = senderWallet.address

        wrapperContract = new ethers.Contract(
            config.get('bridge.usdt.wrapperAddress'),
            wrapperAbi.abi,
            wallet
        )
        usdtContract = new ethers.Contract(
            config.get('bridge.usdt.usdtContractAddress'),
            usdtAbi.abi,
            senderWallet
        )
    })

    describe('Deposit usdt', () => {
        it('Testing balance before and after depositing', async () => {
            try {
                const getAddressData = await axios.post(
                    urljoin(config.get('bridge.serverAPI'), 'address'),
                    {
                        coin: 'usdt',
                        tomo: address
                    }
                )
                depositAddress = getAddressData.data.address
                // trc21 balance of
                const trc21USDTBalanceBefore = await wrapperContract.functions.balanceOf(address)

                // deposit 2 usdt
                const response = await usdtContract.functions.transfer(
                    depositAddress,
                    depositAmount
                )
                console.log(response)
                let interval, apiData, inTx, outTx
                await sleep(180000)
                apiData = await axios.get(
                    urljoin(config.get('bridge.serverAPI'), 'transactions/usdt', address, 'deposit/latest')
                )
                inTx = apiData.data.transaction.InTx
                outTx = apiData.data.transaction.OutTx
                // same tx hash
                expect(response.hash).to.equal(inTx.Hash)
                // same amount
                expect(new BigNumber(depositAmount).toString(10)).to.equal(new BigNumber(outTx.Amount).toString(10))
                // exact deposit address
                expect(depositAddress.toLowerCase()).to.equal(inTx.To.toLowerCase())
                // exact sender address
                expect(response.from.toLowerCase()).to.equal(inTx.From.toLowerCase())

                const trc21USDTBalanceAfter = await wrapperContract.functions.balanceOf(address)
                
                const expectTrc21Balance = new BigNumber(trc21USDTBalanceBefore).plus(new BigNumber(depositAmount)).toString(10)

                // receive exact amount
                expect(new BigNumber(trc21USDTBalanceAfter).toString(10)).to.equal(expectTrc21Balance)
            } catch (error) {
                throw error
            }
        })
    })
    describe('Withdraw usdt', () => {
        it('Testing balance before and after withdrawing', async () => {
            // check trc21 balance before withdraw
            const trc21USDTBalanceBefore = await wrapperContract.functions.balanceOf(address)
            // check main balance before withdraw
            const mainBalanceBefore = await usdtContract.functions.balanceOf(senderAddress)
            // withdraw
            const txParams = {
                nonce: await provider.getTransactionCount(address),
                gasPrice: await provider.getGasPrice(),
                gasLimit: ethers.utils.hexlify(2000000)
            }
            // sign tx
            const response = await wrapperContract.functions.burn(
                depositAmount,
                string2bytes(senderAddress),
                txParams
            )
            console.log(response)
            await sleep(180000)
            const url = urljoin(
                config.get('bridge.serverAPI'),
                '/transactions',
                'usdt',
                address,
                'withdraw',
                'latest'
            )
            const apiData = await axios.get(url)
            console.log(apiData.data)
            const inTx = apiData.data.transaction.InTx
            const outTx = apiData.data.transaction.OutTx
            const withdrawFee = await wrapperContract.functions.WITHDRAW_FEE()
            // check tx hash
            expect(response.hash).to.equal(inTx.Hash)
            // receiver address
            expect(senderAddress.toLowerCase()).to.equal(outTx.To.toLowerCase())
            // check trc21 balance after
            const trc21USDTBalanceAfter = await wrapperContract.functions.balanceOf(address)
            const expectTrc21Balance = new BigNumber(trc21USDTBalanceBefore).minus(new BigNumber(depositAmount)).toString(10)
            expect(new BigNumber(trc21USDTBalanceAfter).toString(10)).to.equal(new BigNumber(expectTrc21Balance).toString(10))
            // check main balance after
            const mainBalanceAfter = await usdtContract.functions.balanceOf(senderAddress)
            const receiveAmount = new BigNumber(depositAmount).minus(new BigNumber(withdrawFee))
            const expectMainBalance = new BigNumber(mainBalanceBefore).plus(receiveAmount)

            expect(new BigNumber(mainBalanceAfter).toString()).to.equal(new BigNumber(expectMainBalance).toString(10))
        })
    })
})
