package com.urlshortener.service;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.urlshortener.config.ShardingDataSourceConfig.ShardJdbcTemplates;

@Component
public class ShardRouter {

    private final List<ShardJdbcTemplates> shards;

    public ShardRouter(List<ShardJdbcTemplates> shards) {
        this.shards = shards;
    }

    public int shardFor(String code) {
        return Math.abs(code.hashCode() % shards.size());
    }

    public ShardJdbcTemplates templatesFor(String code) {
        return shards.get(shardFor(code));
    }

    public JdbcTemplate writeTemplateFor(String code) {
        return templatesFor(code).write();
    }

    public JdbcTemplate readTemplateFor(String code) {
        return templatesFor(code).read();
    }

    public int shardCount() {
        return shards.size();
    }
}
