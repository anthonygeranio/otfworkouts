import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WorkoutPost } from './types';

// Apple Guideline 1.2 requires apps that display user-generated content to let
// users report objectionable posts and block/hide authors. Blocks are stored on
// the device; reports are also sent to our server so we can act on them.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const HIDDEN_AUTHORS_KEY = 'moderation:hiddenAuthors';
const HIDDEN_POSTS_KEY = 'moderation:hiddenPosts';

export interface Moderation {
  authors: Set<string>;
  posts: Set<string>;
}

async function readSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function writeSet(key: string, set: Set<string>) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // best-effort
  }
}

export async function loadModeration(): Promise<Moderation> {
  const [authors, posts] = await Promise.all([readSet(HIDDEN_AUTHORS_KEY), readSet(HIDDEN_POSTS_KEY)]);
  return { authors, posts };
}

/** True if a post should be hidden (its author is blocked or the post was hidden/reported). */
export function isHidden(post: WorkoutPost, mod: Moderation): boolean {
  return mod.authors.has(post.author) || mod.posts.has(post.id);
}

export async function blockAuthor(author: string): Promise<void> {
  const set = await readSet(HIDDEN_AUTHORS_KEY);
  set.add(author);
  await writeSet(HIDDEN_AUTHORS_KEY, set);
}

export async function hidePost(id: string): Promise<void> {
  const set = await readSet(HIDDEN_POSTS_KEY);
  set.add(id);
  await writeSet(HIDDEN_POSTS_KEY, set);
}

/** Reports a post to our server and hides it locally. Reports are reviewed within 24h. */
export async function reportPost(post: WorkoutPost): Promise<void> {
  await hidePost(post.id);
  if (!API_URL) return;
  try {
    await fetch(`${API_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, author: post.author, permalink: post.permalink }),
    });
  } catch {
    // The local hide still applies even if the report request fails.
  }
}
