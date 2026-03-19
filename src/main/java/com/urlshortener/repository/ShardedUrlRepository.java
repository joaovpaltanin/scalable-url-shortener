package com.urlshortener.repository;

import java.util.Optional;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.urlshortener.model.ShortenedUrl;
import com.urlshortener.service.ShardRouter;

@Repository
public class ShardedUrlRepository {

    private final ShardRouter router;

    public ShardedUrlRepository(ShardRouter router) {
        this.router = router;
    }

    /**
     * @throws DuplicateKeyException if the code already exists on the target shard
     */
    public ShortenedUrl save(String code, String originalUrl) {
        JdbcTemplate jdbc = router.templateFor(code);
        jdbc.update(
                "INSERT INTO shortened_urls (code, original_url, created_at) VALUES (?, ?, NOW())",
                code, originalUrl);
        return new ShortenedUrl(code, originalUrl);
    }

    public Optional<ShortenedUrl> findByCode(String code) {
        JdbcTemplate jdbc = router.templateFor(code);
        return jdbc.query(
                "SELECT code, original_url FROM shortened_urls WHERE code = ?",
                (rs, rowNum) -> new ShortenedUrl(
                        rs.getString("code"),
                        rs.getString("original_url")),
                code
        ).stream().findFirst();
    }

    public boolean existsByCode(String code) {
        JdbcTemplate jdbc = router.templateFor(code);
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shortened_urls WHERE code = ?",
                Integer.class, code);
        return count != null && count > 0;
    }
}
