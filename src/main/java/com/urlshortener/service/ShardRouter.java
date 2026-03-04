package com.urlshortener.service;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ShardRouter {

    private final List<JdbcTemplate> shards;

    public ShardRouter(List<JdbcTemplate> shards) {
        this.shards = shards;
    }

    public int shardFor(String code) {
        return Math.abs(code.hashCode() % shards.size());
    }

    public JdbcTemplate templateFor(String code) {
        return shards.get(shardFor(code));
    }

    public int shardCount() {
        return shards.size();
    }
}
