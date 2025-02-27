import fs from 'fs';
import path from 'path';

import { assert } from '@cosmjs/utils';
import test from 'ava';
import sinon from 'sinon';
import { Logger } from 'winston';

import { Link } from '../../../lib/link';
import { TestLogger } from '../../../lib/testutils';
import { appFile } from '../../constants';
import { signingClient } from '../../utils/signing-client';

import { simappChain, wasmdChain } from './chains';
import { Options, run } from './ics20';

const fsWriteFileSync = sinon.stub(fs, 'writeFileSync');
const fsReadFileSync = sinon.stub(fs, 'readFileSync');

const mnemonic =
  'enlist hip relief stomach skate base shallow young switch frequent cry park';

const registryYaml = `
version: 1

chains:
  local_wasm:
    chain_id: testing
    prefix: wasm
    gas_price: 0.025ucosm
    rpc:
      - http://localhost:26659
  local_simapp:
    chain_id: simd-testing
    prefix: cosmos
    gas_price: 0.025umuon
    rpc:
      - http://localhost:26658`;

const app = {
  src: 'local_wasm',
  dest: 'local_simapp',
};

test.beforeEach(() => {
  sinon.reset();
});

test.serial('ics20 create channels with new connection', async (t) => {
  const logger = new TestLogger();

  const ibcClientSimapp = await signingClient(simappChain, mnemonic);
  const ibcClientWasm = await signingClient(wasmdChain, mnemonic);

  const allConnectionsWasm = await ibcClientWasm.query.ibc.connection.allConnections();
  const allConnectionsSimapp = await ibcClientSimapp.query.ibc.connection.allConnections();

  const options: Options = {
    home: '/home/user',
    mnemonic,
    src: 'local_wasm',
    dest: 'local_simapp',
    srcPort: 'transfer',
    destPort: 'custom',
    connections: null,
  };

  fsReadFileSync.returns(registryYaml);
  fsWriteFileSync.returns();

  await run(options, app, (logger as unknown) as Logger);

  const args = fsWriteFileSync.getCall(0).args as [string, string];
  const contentsRegexp = new RegExp(
    `src: local_wasm
dest: local_simapp
srcConnection: .+
destConnection: .+
`
  );
  t.assert(fsWriteFileSync.calledOnce);
  t.is(args[0], path.join(options.home, appFile));
  t.regex(args[1], contentsRegexp);
  t.is(logger.info.callCount, 6);
  t.assert(logger.info.calledWithMatch(/Connection open/));
  t.assert(logger.info.calledWithMatch(/Connection open/));
  t.assert(logger.info.calledWithMatch(/Connection open/));
  t.assert(logger.info.calledWithMatch(/Connection open/));
  t.assert(logger.info.calledWithMatch(/Created connections/));
  t.assert(logger.info.calledWithMatch(/Created channels/));

  const nextAllConnectionsWasm = await ibcClientWasm.query.ibc.connection.allConnections();
  const srcConnectionIdMatch = /srcConnection: (?<connection>.+)/.exec(args[1]);
  const srcConnectionId = srcConnectionIdMatch?.groups?.connection;
  assert(srcConnectionId);
  const nextConnectionWasm = await ibcClientWasm.query.ibc.connection.connection(
    srcConnectionId
  );

  const nextAllConnectionsSimapp = await ibcClientSimapp.query.ibc.connection.allConnections();
  const destConnectionIdMatch = /destConnection: (?<connection>.+)/.exec(
    args[1]
  );
  const destConnectionId = destConnectionIdMatch?.groups?.connection;
  assert(destConnectionId);
  const nextConnectionSimapp = await ibcClientSimapp.query.ibc.connection.connection(
    destConnectionId
  );

  t.is(
    nextAllConnectionsWasm.connections.length,
    allConnectionsWasm.connections.length + 1
  );
  t.is(
    nextAllConnectionsSimapp.connections.length,
    allConnectionsSimapp.connections.length + 1
  );
  t.assert(nextConnectionWasm.connection);
  t.assert(nextConnectionSimapp.connection);
});

test.serial('ics20 create channels with existing connection', async (t) => {
  const logger = new TestLogger();

  const ibcClientSimapp = await signingClient(simappChain, mnemonic);
  const ibcClientWasm = await signingClient(wasmdChain, mnemonic);
  const link = await Link.createWithNewConnections(
    ibcClientWasm,
    ibcClientSimapp
  );

  const allConnectionsSimapp = await ibcClientSimapp.query.ibc.connection.allConnections();
  const allConnectionsWasm = await ibcClientWasm.query.ibc.connection.allConnections();

  const options: Options = {
    home: '/home/user',
    mnemonic,
    src: 'local_wasm',
    dest: 'local_simapp',
    srcPort: 'transfer',
    destPort: 'custom',
    connections: {
      src: link.endA.connectionID,
      dest: link.endB.connectionID,
    },
  };

  fsReadFileSync.returns(registryYaml);
  fsWriteFileSync.returns();

  await run(options, app, (logger as unknown) as Logger);

  const args = fsWriteFileSync.getCall(0).args as [string, string];
  const contentsRegexp = new RegExp(
    `src: local_wasm
dest: local_simapp
srcConnection: ${link.endA.connectionID}
destConnection: ${link.endB.connectionID}
`
  );

  t.assert(fsWriteFileSync.calledOnce);
  t.is(args[0], path.join(options.home, appFile));
  t.regex(args[1], contentsRegexp);
  t.assert(logger.info.calledThrice);
  t.assert(logger.info.calledWithMatch(/Used existing connections/));
  t.assert(logger.info.calledWithMatch(/Create channel/));
  t.assert(logger.info.calledWithMatch(/Created channels/));

  const nextAllConnectionsWasm = await ibcClientWasm.query.ibc.connection.allConnections();
  const nextAllConnectionsSimapp = await ibcClientSimapp.query.ibc.connection.allConnections();

  t.is(
    nextAllConnectionsWasm.connections.length,
    allConnectionsWasm.connections.length
  );
  t.is(
    nextAllConnectionsSimapp.connections.length,
    allConnectionsSimapp.connections.length
  );
});
