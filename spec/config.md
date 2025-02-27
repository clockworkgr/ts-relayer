# Configuration

While most of the commands will be specified via command-line flags, it would be very
tedious to pass in all configuration options every time. Thus, we allow 3 ways to configure
most items - config file (yaml), environmental variables, and command line flags. With the
later taking precedence over the former. Environmental variables will all begin with `RELAYER_`
for both binaries.

## Config File Location

All files will be looked for relative to a "home" directory. As this is meant to be run
as a daemon (unix service), the default home directory for `ibc-relayer` will be `/etc/relayer.d`.
On the other hand, the user-focused `ibc-setup` will default to `$HOME/.ibc-setup` as the "home"
directory.

This may be overriden via the `RELAYER_HOME` env variable, or `--home` CLI flag.

## Registry Format

The principle config file is `registry.yaml`, which is a required file and is encoded
in yaml format. It contains all the chain-specific information needed to connect to the chains.
They are all considered to be Cosmos SDK chains and compatible with 0.41. We may make changes
in a future version (thus all files are versioned as 1).

```yaml
version: 1

chains:
  - musselnet:
      - chain_id: musselnet-2
      # bech32 prefix for addresses
      - prefix: wasm
      # this determines the gas payments we make (and defines the fee token)
      - gas_price: 0.1umayo
      # the path we use to derive the private key from the mnemonic
      - hd_path: 44'/108'/0'/1'
      # you can include multiple RPC endpoints and it will rotate through them if
      # one is down
      - rpc:
          - https://rpc.musselnet.cosmwasm.com:443
          - https://rpc.musselnet.aneka.com:443
  - bifrost:
    # ...
```

The chains variable is a lookup based on human-friendly chain names (can be different that the chain_id).
It should contain all needed info to configure a relayer connection to that chain.

## Other Configuration

In addition to the required `registry.yaml`. there is an optional `app.yaml` file that is used as a fall back
for any environmental variable. Unless otherwise specified, all command line flags can be defined either
as environmental variables or in `app.yaml`. If they are not defined in any of these places, this will raise an error.

There is a simple pattern for this. Take two examples:

- CLI flags: `--src` and `--log-level`
- Env Vars (Prefix `RELAYER_`, use `_` not `-`): `RELAYER_SRC` and `RELAYER_LOG_LEVEL`
- `app.yaml` (Same name as flag, but using `_` not `-`): `src:` and `log_level:`

### Chain Selection

Every command will need to know what chains to connect to. The registry file may contain dozens of different
chains and be reused by validators making various connections. We just need to pass in a pair of names to each
command, so it can look up all needed configuration.

`--src=musselnet` and `--dest=bifrost` will define the two chains to connect to, as well as the direction.
If creating a connection/channel, we init on the "src" side. If relaying packets, we may relay packets from
one chain to another (some configurations will be bi-directional).

As mentioned above, if a CLI flag is not found, we will check for an environmental variable, and ultimately `app.yaml`

### Connection Selection

Many commands require an already established
