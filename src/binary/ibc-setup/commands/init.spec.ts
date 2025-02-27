import fs from 'fs';

import test from 'ava';
import axios from 'axios';
import sinon from 'sinon';
import { Logger } from 'winston';

import { TestLogger } from '../../../lib/testutils';

import { Options, run } from './init';

const fsExistSync = sinon.stub(fs, 'existsSync');
const fsMkdirSync = sinon.stub(fs, 'mkdirSync');
const axiosGet = sinon.stub(axios, 'get');
const fsReadFileSync = sinon.stub(fs, 'readFileSync');
const fsWriteFileSync = sinon.stub(fs, 'writeFileSync');

sinon.replace(
  fs,
  'lstatSync',
  sinon.fake.returns({
    isDirectory: () => true,
    isFile: () => true,
  })
);

const registryYaml = `
version: 1

chains:
  local_wasm:
    chain_id: testing
    prefix: wasm
    gas_price: 0.025ucosm
    hd_path: m/44'/108'/0'/2'
    rpc:
      - http://localhost:26659
  local_simapp:
    chain_id: simd-testing
    prefix: cosmos
    gas_price: 0.025umuon
    hd_path: m/44'/108'/0'/3'
    rpc:
      - http://localhost:26658`;

test.beforeEach(() => {
  sinon.reset();
});

test('create app.yaml', async (t) => {
  const logger = new TestLogger();

  const options: Options = {
    home: '/home/user',
    src: 'local_wasm',
    dest: 'local_simapp',
  };
  const appPath = `${options.home}/app.yaml`;
  const registryPath = `${options.home}/registry.yaml`;

  fsExistSync
    .onCall(0)
    .returns(false)
    .onCall(1)
    .returns(true)
    .onCall(2)
    .returns(true);
  axiosGet.resolves({
    data: registryYaml,
  });
  fsReadFileSync.returns(registryYaml);
  fsWriteFileSync.returns();

  await run(options, (logger as unknown) as Logger);

  t.assert(fsMkdirSync.notCalled);
  t.assert(axiosGet.notCalled);
  t.assert(fsReadFileSync.calledOnceWith(registryPath));

  const [path, contents] = fsWriteFileSync.getCall(0).args;
  const appYamlRegexp = new RegExp(
    `src: ${options.src}\ndest: ${options.dest}\nmnemonic: [\\w ]+`,
    'mg'
  );
  t.is(path, appPath);
  t.regex(contents as string, appYamlRegexp);

  t.assert(logger.info.getCall(-2).calledWithMatch(/Source address: [\w ]+/));
  t.assert(
    logger.info.getCall(-1).calledWithMatch(/Destination address: [\w ]+/)
  );
});

test('initialize home directory, pull registry.yaml and create app.yaml', async (t) => {
  const logger = new TestLogger();

  const options: Options = {
    home: '/home/user',
    src: 'local_wasm',
    dest: 'local_simapp',
  };
  const appPath = `${options.home}/app.yaml`;
  const registryPath = `${options.home}/registry.yaml`;

  fsExistSync
    .onCall(0)
    .returns(false)
    .onCall(1)
    .returns(false)
    .onCall(2)
    .returns(false);
  fsMkdirSync.returns(options.home);
  axiosGet.resolves({
    data: registryYaml,
  });
  fsReadFileSync.returns(registryYaml);
  fsWriteFileSync.returns();

  await run(options, (logger as unknown) as Logger);

  t.assert(fsMkdirSync.calledOnceWith(options.home));
  t.assert(axiosGet.calledOnce);
  t.assert(fsReadFileSync.calledOnceWith(registryPath));
  t.assert(fsWriteFileSync.calledWithExactly(registryPath, registryYaml));
  t.assert(logger.info.calledWithMatch(new RegExp(`at ${options.home}`)));

  const [path, contents] = fsWriteFileSync.getCall(1).args;
  const appYamlRegexp = new RegExp(
    `src: ${options.src}\ndest: ${options.dest}\nmnemonic: [\\w ]+`,
    'mg'
  );
  t.is(path, appPath);
  t.regex(contents as string, appYamlRegexp);

  t.assert(logger.info.getCall(-2).calledWithMatch(/Source address: [\w ]+/));
  t.assert(
    logger.info.getCall(-1).calledWithMatch(/Destination address: [\w ]+/)
  );
});

test('throws when cannot fetch registry.yaml from remote', async (t) => {
  const logger = new TestLogger();

  const options: Options = {
    home: '/home/user',
    src: 'local_wasm',
    dest: 'local_simapp',
  };

  fsExistSync.returns(false);
  fsMkdirSync.returns(options.home);
  axiosGet.rejects();
  fsReadFileSync.returns('');
  fsWriteFileSync.returns();

  await t.throwsAsync(
    async () => await run(options, (logger as unknown) as Logger),
    {
      instanceOf: Error,
      message: /Cannot fetch registry.yaml/,
    }
  );

  t.assert(fsMkdirSync.calledOnceWith(options.home));
  t.assert(axiosGet.calledOnce);
});

test('returns early if app.yaml exists', async (t) => {
  const logger = new TestLogger();

  const options: Options = {
    home: '/home/user',
    src: 'local_wasm',
    dest: 'local_simapp',
  };

  fsExistSync.onCall(0).returns(true);

  await run(options, (logger as unknown) as Logger);

  t.assert(fsExistSync.calledOnce);
  t.assert(logger.info.calledWithMatch(/app.yaml is already initialized/));
  t.assert(logger.info.calledOnce);
});

test('throws if provided chain does not exist in the registry', async (t) => {
  const logger = new TestLogger();

  const options: Options = {
    home: '/home/user',
    src: 'chain_that_does_not_exist',
    dest: 'local_simapp',
  };
  const registryPath = `${options.home}/registry.yaml`;

  fsExistSync
    .onCall(0)
    .returns(false)
    .onCall(1)
    .returns(true)
    .onCall(2)
    .returns(true);
  axiosGet.resolves({
    data: registryYaml,
  });
  fsReadFileSync.returns(registryYaml);

  await t.throwsAsync(
    async () => await run(options, (logger as unknown) as Logger),
    {
      instanceOf: Error,
      message: new RegExp(`${options.src} is missing in the registry`),
    }
  );

  t.assert(fsMkdirSync.notCalled);
  t.assert(axiosGet.notCalled);
  t.assert(fsReadFileSync.calledOnceWith(registryPath));
});
