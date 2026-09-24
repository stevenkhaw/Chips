import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { useCanEdit } from '@/store/useHousesStore';

/** Renders children for the house owner; sends readers to `fallback`. UX only: the server enforces permissions. */
export function EditorOnly({ fallback, children }: { fallback: Href; children: React.ReactNode }) {
  const canEdit = useCanEdit();
  return canEdit ? <>{children}</> : <Redirect href={fallback} />;
}
