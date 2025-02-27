import { toHex } from '@cosmjs/encoding';
import { logs } from '@cosmjs/launchpad';
import { parseRawLog } from '@cosmjs/stargate';
import { CommitResponse } from '@cosmjs/tendermint-rpc';

import { Packet } from '../codec/ibc/core/channel/v1/channel';

import { IbcClient } from './ibcclient';
import { Ack, parseAcksFromLogs, parsePacketsFromLogs } from './utils';

export interface PacketWithMetadata {
  packet: Packet;
  // block it was in, must query proofs >= height
  height: number;
  // who send the packet (first signer of the tx this was in)
  sender: string;
}

export type AckWithMetadata = Ack & {
  // block the ack was in, must query proofs >= height
  height: number;
};

export interface QueryOpts {
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Endpoint is a wrapper around SigningStargateClient as well as ClientID
 * and ConnectionID. Two Endpoints compose a Link and this should expose all the
 * methods you need to work on one half of an IBC Connection, the higher-level
 * orchestration is handled in Link.
 */
export class Endpoint {
  public readonly client: IbcClient;
  public readonly clientID: string;
  public readonly connectionID: string;

  public constructor(
    client: IbcClient,
    clientID: string,
    connectionID: string
  ) {
    this.client = client;
    this.clientID = clientID;
    this.connectionID = connectionID;
  }

  public chainId(): string {
    return this.client.chainId;
  }

  public async getLatestCommit(): Promise<CommitResponse> {
    return this.client.getCommit();
  }

  // returns all packets (auto-paginates, so be careful about not setting a minHeight)
  public async querySentPackets({
    minHeight,
    maxHeight,
  }: QueryOpts = {}): Promise<PacketWithMetadata[]> {
    let query = `send_packet.packet_connection='${this.connectionID}'`;
    if (minHeight) {
      query = `${query} AND tx.height>=${minHeight}`;
    }
    if (maxHeight) {
      query = `${query} AND tx.height<=${maxHeight}`;
    }

    const search = await this.client.tm.txSearchAll({ query });
    const resultsNested = search.txs.map(({ hash, height, result }) => {
      const parsedLogs = parseRawLog(result.log);
      // we accept message.sender (cosmos-sdk) and message.signer (x/wasm)
      let sender = '';
      try {
        sender = logs.findAttribute(parsedLogs, 'message', 'sender').value;
      } catch {
        try {
          sender = logs.findAttribute(parsedLogs, 'message', 'signer').value;
        } catch {
          this.client.logger.warn(
            `No message.sender nor message.signer in tx ${toHex(hash)}`
          );
        }
      }
      return parsePacketsFromLogs(parsedLogs).map((packet) => ({
        packet,
        height,
        sender,
      }));
    });
    return ([] as PacketWithMetadata[]).concat(...resultsNested);
  }

  // returns all acks (auto-paginates, so be careful about not setting a minHeight)
  public async queryWrittenAcks({
    minHeight,
    maxHeight,
  }: QueryOpts = {}): Promise<AckWithMetadata[]> {
    let query = `write_acknowledgement.packet_connection='${this.connectionID}'`;
    if (minHeight) {
      query = `${query} AND tx.height>=${minHeight}`;
    }
    if (maxHeight) {
      query = `${query} AND tx.height<=${maxHeight}`;
    }

    const search = await this.client.tm.txSearchAll({ query });
    const resultsNested = search.txs.map(({ height, result }) => {
      const parsedLogs = parseRawLog(result.log);
      // const sender = logs.findAttribute(parsedLogs, 'message', 'sender').value;
      return parseAcksFromLogs(parsedLogs).map((ack) => ({
        height,
        ...ack,
      }));
    });
    return ([] as AckWithMetadata[]).concat(...resultsNested);
  }
}

/**
 * Requires a match of any set field
 *
 * This is designed to easily produce search/subscription query strings,
 * not principally for in-memory filtering.
 */
export interface Filter {
  readonly srcPortId?: string;
  readonly srcChannelId?: string;
  readonly destPortId?: string;
  readonly destChannelId?: string;
}
