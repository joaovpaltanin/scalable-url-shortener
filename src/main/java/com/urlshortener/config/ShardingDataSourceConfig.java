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
    public List<JdbcTemplate> shardJdbcTemplates() {
        return shards.stream()
                .map(this::createJdbcTemplate)
                .toList();
    }

    private JdbcTemplate createJdbcTemplate(ShardProperties props) {
        DataSource ds = DataSourceBuilder.create()
                .url(props.getUrl())
                .username(props.getUsername())
                .password(props.getPassword())
                .build();
        return new JdbcTemplate(ds);
    }

    public static class ShardProperties {
        private String url;
        private String username;
        private String password;

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
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
