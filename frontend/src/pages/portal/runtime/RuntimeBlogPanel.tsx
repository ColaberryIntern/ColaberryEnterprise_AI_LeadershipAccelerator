import React, { useEffect, useState } from 'react';
import { blogReaderDoc } from '../../../components/timeline/CardDetailBody';
import { runtimeApi, type BlogReaderContent, type RtOpen } from './runtimeApi';

/**
 * Blog: the post's article, fetched + sanitized server-side, rendered IN a sandboxed frame so the student never leaves the system
 * (the training site refuses to be iframed). Fills the center as the single scroll; the read gate + collect live in the slim foot
 * (the page hands the gate in). Falls back to the external link. Lifted out of RuntimeWorkspace unchanged, with its fetch, when the
 * page passed the 500-line ceiling (Campus C19).
 */
export default function RuntimeBlogPanel({ blogId, card, displayTitle, gate }: {
  blogId: string | null; card: RtOpen['card']; displayTitle: string; gate: React.ReactNode;
}): React.ReactElement {
  // In-workspace blog reader payload (fetched + sanitized server-side).
  const [blogReader, setBlogReader] = useState<BlogReaderContent | null>(null);

  // Load the post's article for the in-workspace reader (fail-soft: ok:false → link).
  useEffect(() => {
    if (!blogId) { setBlogReader(null); return; }
    let alive = true;
    setBlogReader(null);
    runtimeApi.blogReader(blogId)
      .then((c) => { if (alive) setBlogReader(c); })
      .catch(() => { if (alive) setBlogReader({ ok: false, title: null, body_html: null, excerpt: null, author: null, featured_image: null, source_url: null }); });
    return () => { alive = false; };
  }, [blogId]);

  return (
    <div className="rt-readerwrap">
      {blogReader === null ? (
        <div className="rt-muted" style={{ padding: 40 }}>Loading the post…</div>
      ) : blogReader.ok && blogReader.body_html ? (
        <iframe
          className="rt-readerframe"
          title="Blog post"
          sandbox="allow-scripts allow-popups"
          srcDoc={blogReaderDoc(blogReader.body_html, blogReader.title || card.blog?.title || displayTitle, { featuredImage: blogReader.featured_image, author: blogReader.author, sourceUrl: blogReader.source_url })}
        />
      ) : (
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <p className="rt-muted" style={{ margin: 0 }}>We couldn't load this post inside the workspace.</p>
          {card.blog?.url && <a className="rt-btn pri" href={card.blog.url} target="_blank" rel="noopener noreferrer">Read on the training site ↗</a>}
        </div>
      )}
      <div className="rt-readerfoot">{gate}</div>
    </div>
  );
}
