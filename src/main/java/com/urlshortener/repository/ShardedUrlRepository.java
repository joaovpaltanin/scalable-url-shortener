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
        JdbcTemplate jdbc = router.writeTemplateFor(code);
        jdbc.update(
                "INSERT INTO shortened_urls (code, original_url, created_at) VALUES (?, ?, NOW())",
                code, originalUrl);
        return new ShortenedUrl(code, originalUrl);
    }

    public Optional<ShortenedUrl> findByCode(String code) {
        Optional<ShortenedUrl> fromReplica = queryByCode(router.readTemplateFor(code), code);
        if (fromReplica.isPresent()) {
            return fromReplica;
        }

        // Replication lag fallback: if the replica hasn't caught up yet,
        // query the primary before returning 404.
        return queryByCode(router.writeTemplateFor(code), code);
    }

    public boolean existsByCode(String code) {
        Integer count = router.writeTemplateFor(code).queryForObject(
                "SELECT COUNT(*) FROM shortened_urls WHERE code = ?",
                Integer.class,
                code);
        return count != null && count > 0;
    }

    private Optional<ShortenedUrl> queryByCode(JdbcTemplate jdbc, String code) {
        return jdbc.query(
                "SELECT code, original_url FROM shortened_urls WHERE code = ?",
                (rs, rowNum) -> new ShortenedUrl(
                        rs.getString("code"),
                        rs.getString("original_url")),
                code).stream().findFirst();
    }
}
