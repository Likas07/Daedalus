# Harness Suite Notes

## Benchmark runner docs

For subscription-backed benchmark runs, see:
- `testing/subscription-auth.md` for host login/auth-store setup
- `testing/run_harness_benchmarks.py --dry-run --all` to inspect resolved auth sources before running
- `testing/run_harness_benchmarks.sh` for a full baseline run
- `testing/run_daedalus_regression.sh` for Daedalus-only reruns

## Why these tasks use host networking

This machine cannot run Docker containers on the default bridge network.

Observed failure mode:
- default `docker build` and `docker run` fail while Docker tries to create the bridge-network veth pair
- `docker build --network host` works
- `docker run --network host` works
- the host is missing usable `veth` support, so Docker bridge networking is not available here

Because Harbor's standard Docker environment uses Docker Compose, the local workaround for this machine is to force the task container onto host networking.

Each task therefore includes:

```yaml
services:
  main:
    network_mode: host
    build:
      network: host
```

in `environment/docker-compose.yaml`.

## Why `allow_internet = true`

Harbor appends its `docker-compose-no-network.yaml` overlay when:

```toml
[environment]
allow_internet = false
```

That overlay sets:

```yaml
services:
  main:
    network_mode: none
```

So if `allow_internet` stayed `false`, Harbor would override the task-level host-network setting and the workaround would stop working.

For that reason, all tasks in this suite currently set:

```toml
allow_internet = true
```

This is not because the tasks require internet. It is only to prevent Harbor from appending the no-network override on this machine.

## Tradeoff

These tasks are now runnable with Harbor on this host, but they are less isolated than a normal Docker bridge/no-network setup.

In practice:
- task environments use host networking
- Harbor's built-in no-internet isolation is disabled for this suite on this machine

## How to revert on a machine with working Docker bridge networking

If you run this suite on a machine where normal Docker bridge/veth support works:

1. Remove `environment/docker-compose.yaml` from each task, or remove these fields from it:

```yaml
network_mode: host
build:
  network: host
```

2. Change each task's `task.toml` back to:

```toml
allow_internet = false
```

After that, Harbor will resume using its normal Docker networking behavior, including its no-network overlay for these tasks.

## Current status

This suite has been verified in this workspace with:
- task-structure validation
- oracle solution coverage
- Harbor-style Docker Compose probing using the host-network override
