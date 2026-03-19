package com.urlshortener.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
@ConfigurationProperties(prefix = "sharding")
public class ShardingDataSourceConfig {

    private List<ShardProperties> shards = new ArrayList<>();

    public List<ShardProperties> getShards() {
        return shards;
    }

    public void setShards(List<ShardProperties> shards) {
        this.shards = shards;
    }

    @Bean
    public List<ShardJdbcTemplates> shardJdbcTemplates() {
        return shards.stream()
                .map(this::createShardJdbcTemplates)
                .toList();
    }

    private ShardJdbcTemplates createShardJdbcTemplates(ShardProperties props) {
        DataSource writeDs = DataSourceBuilder.create()
                .url(props.getWriteUrl())
                .username(props.getUsername())
                .password(props.getPassword())
                .build();
        DataSource readDs = DataSourceBuilder.create()
                .url(props.getReadUrl())
                .username(props.getUsername())
                .password(props.getPassword())
                .build();

        return new ShardJdbcTemplates(
                new JdbcTemplate(writeDs),
                new JdbcTemplate(readDs));
    }

    public record ShardJdbcTemplates(JdbcTemplate write, JdbcTemplate read) {
    }

    public static class ShardProperties {
        private String writeUrl;
        private String readUrl;
        private String username;
        private String password;

        public String getWriteUrl() {
            return writeUrl;
        }

        public void setWriteUrl(String writeUrl) {
            this.writeUrl = writeUrl;
        }

        public String getReadUrl() {
            return readUrl;
        }

        public void setReadUrl(String readUrl) {
            this.readUrl = readUrl;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }
}
