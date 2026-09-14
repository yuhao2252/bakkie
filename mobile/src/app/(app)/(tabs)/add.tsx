import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Message, Screen, TextField } from '@/components/ui';
import { createPhotoImport, createUrlImport, type ImportJob, useRecentImports } from '@/lib/imports';
import { MAX_PHOTOS, type PickedPhoto, pickPhotos, takePhoto } from '@/lib/photos';
import { colors, radius, space, typography } from '@/lib/theme';

const STATUS_LABEL: Record<ImportJob['status'], string> = {
  pending: 'Waiting',
  extracting: 'Reading…',
  extracted: 'Ready to review',
  failed: 'Failed',
  confirmed: 'Added',
  rejected: 'Discarded',
};

function describeSource(job: ImportJob): string {
  if (job.source === 'url' && job.source_url) {
    try {
      return new URL(job.source_url).hostname.replace(/^www\./, '');
    } catch {
      return job.source_url;
    }
  }
  return 'Photo import';
}

export default function AddScreen() {
  const [url, setUrl] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recent = useRecentImports();

  const openImport = (jobId: string) => router.push(`/import/${jobId}`);

  const urlImport = useMutation({
    mutationFn: createUrlImport,
    onSuccess: (jobId) => {
      setUrl('');
      openImport(jobId);
    },
    onError: (err) => setError(err.message),
  });

  const photoImport = useMutation({
    mutationFn: createPhotoImport,
    onSuccess: (jobId) => {
      setPhotos([]);
      openImport(jobId);
    },
    onError: (err) => setError(err.message),
  });

  async function addPhotos(source: 'camera' | 'library') {
    setError(null);
    try {
      const added =
        source === 'camera'
          ? [await takePhoto()].filter((photo): photo is PickedPhoto => photo !== null)
          : await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const trimmedUrl = url.trim();
  const urlLooksValid = /^https?:\/\/[^\s.]+\.\S+$/i.test(trimmedUrl);
  const busy = urlImport.isPending || photoImport.isPending;
  const photosFull = photos.length >= MAX_PHOTOS;
  const recentImports = recent.data ?? [];

  function importLink() {
    setError(null);
    urlImport.mutate(trimmedUrl);
  }

  function importPhotos() {
    setError(null);
    photoImport.mutate(photos);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={typography.title}>Add coffee</Text>
          {error ? <Message tone="error">{error}</Message> : null}

          <Card>
            <Text style={typography.heading}>From a web page</Text>
            <TextField
              label="Product link"
              placeholder="https://roaster.com/products/…"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => urlLooksValid && !busy && importLink()}
            />
            <Button
              title="Import link"
              onPress={importLink}
              disabled={!urlLooksValid || busy}
              loading={urlImport.isPending}
            />
          </Card>

          <Card>
            <Text style={typography.heading}>From photos</Text>
            <Text style={typography.muted}>
              Photograph the front and the back of the bag. The back usually has the origin, process and roast date.
            </Text>

            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                {photos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`}>
                    <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
                    <Pressable
                      accessibilityLabel={`Remove photo ${index + 1}`}
                      hitSlop={8}
                      onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                      style={styles.remove}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  title="Take photo"
                  variant="secondary"
                  onPress={() => addPhotos('camera')}
                  disabled={busy || photosFull}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  title="Choose photos"
                  variant="secondary"
                  onPress={() => addPhotos('library')}
                  disabled={busy || photosFull}
                />
              </View>
            </View>

            {photos.length > 0 ? (
              <Button
                title={`Import ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}
                onPress={importPhotos}
                disabled={busy}
                loading={photoImport.isPending}
              />
            ) : null}
          </Card>

          {recentImports.length > 0 ? (
            <View style={styles.section}>
              <Text style={typography.label}>Recent imports</Text>
              {recentImports.map((job) => (
                <Pressable key={job.id} onPress={() => openImport(job.id)}>
                  <Card style={styles.importRow}>
                    <View style={styles.flex}>
                      <Text style={typography.body} numberOfLines={1}>
                        {describeSource(job)}
                      </Text>
                      <Text style={typography.muted}>{new Date(job.created_at).toLocaleString()}</Text>
                    </View>
                    <Text
                      style={[
                        styles.status,
                        job.status === 'failed' && { color: colors.danger },
                        job.status === 'extracted' && { color: colors.primary },
                      ]}>
                      {STATUS_LABEL[job.status]}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  thumbs: {
    gap: space.sm,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  removeText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  section: {
    gap: space.sm,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
});
