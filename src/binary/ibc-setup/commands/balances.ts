import os from 'os';
import path from 'path';

import { stringToPath } from '@cosmjs/crypto';
import { GasPrice } from '@cosmjs/launchpad';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { Logger } from 'winston';

import { Coin } from '../../../codec/cosmos/base/v1beta1/coin';
import { IbcClient } from '../../../lib/ibcclient';
import { registryFile } from '../../constants';
import { loadAndValidateApp } from '../../utils/load-and-validate-app';
import { loadAndValidateRegistry } from '../../utils/load-and-validate-registry';
import { resolveHomeOption } from '../../utils/options/shared/resolve-home-option';
import { resolveKeyFileOption } from '../../utils/options/shared/resolve-key-file-option';
import { resolveMnemonicOption } from '../../utils/options/shared/resolve-mnemonic-option';

import { Flags, getAddresses, Options } from './keys-list';

export async function balances(flags: Flags, logger: Logger) {
  const home = resolveHomeOption({ homeFlag: flags.home });
  const app = loadAndValidateApp(home);
  const keyFile = resolveKeyFileOption({ keyFileFlag: flags.keyFile, app });
  const mnemonic = await resolveMnemonicOption({
    interactiveFlag: flags.interactive,
    mnemonicFlag: flags.mnemonic,
    keyFile: keyFile,
    app,
  });

  const options: Options = {
    home,
    mnemonic,
  };

  await run(options, logger);
}

export async function run(options: Options, logger: Logger) {
  const registryFilePath = path.join(options.home, registryFile);
  const registry = loadAndValidateRegistry(registryFilePath);

  const addresses = await getAddresses(registry.chains, options.mnemonic);

  const balances = (
    await Promise.all(
      addresses.map<Promise<[string, Coin]>>(async ([chain, data, address]) => {
        const signer = await DirectSecp256k1HdWallet.fromMnemonic(
          options.mnemonic,
          data.hd_path ? stringToPath(data.hd_path) : undefined,
          data.prefix
        );

        const gasPrice = GasPrice.fromString(data.gas_price);

        const client = await IbcClient.connectWithSigner(
          data.rpc[0], // rpc[0] is guaranteed to be defined by registry validator
          signer,
          address,
          {
            prefix: data.prefix,
            gasPrice,
          }
        );

        const coin = await client.query.bank.unverified.balance(
          address,
          gasPrice.denom
        );

        return [chain, coin];
      })
    )
  )
    .filter(([, coin]) => coin.amount !== '0')
    .map(([chain, coin]) => `${chain}: ${coin.amount}${coin.denom}`)
    .join(os.EOL);

  if (!balances) {
    logger.info('No funds found for default denomination on any chain.');
    return;
  }

  logger.info(balances);
}
