package com.urlshortener.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class UrlCacheService {

    private static final Logger log = LoggerFactory.getLogger(UrlCacheService.class);
    private static final String KEY_PREFIX = "url:";

    private final StringRedisTemplate redis;

    public UrlCacheService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public String get(String code) {
        try {
            return redis.opsForValue().get(KEY_PREFIX + code);
        } catch (Exception e) {
            log.warn("Redis GET failed for code={}: {}", code, e.getMessage());
            return null;
        }
    }

    public void put(String code, String originalUrl) {
        try {
            redis.opsForValue().set(KEY_PREFIX + code, originalUrl);
        } catch (Exception e) {
            log.warn("Redis SET failed for code={}: {}", code, e.getMessage());
        }
    }
}
