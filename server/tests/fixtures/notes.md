# Research notes

Consensus protocols are the foundation of replicated state machines.

Raft splits the problem into leader election, log replication and safety.

A term acts as a logical clock. At most one leader is elected per term.
