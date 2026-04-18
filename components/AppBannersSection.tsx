import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import type { AppBanner, AppBannerSettings } from '@/services/appBannerService';

type Props = {
  banners: AppBanner[];
  settings: AppBannerSettings | null;
};

const BANNER_ASPECT = 1.8;

function handleBannerPress(banner: AppBanner) {
  if (!banner.target_url) return;
  // Reservado: Linking.openURL, WebBrowser, deep links ou analytics.
}

function AppBannersSectionInner({ banners, settings }: Props) {
  const { width: screenW } = useWindowDimensions();
  const contentWidth = Math.max(0, screenW - 40);
  const bannerHeight = contentWidth / BANNER_ASPECT;

  const flatRef = useRef<FlatList<AppBanner>>(null);
  const [index, setIndex] = useState(0);
  /** Reinicia o intervalo de auto-slide só quando o utilizador desliza manualmente (não após scroll programático). */
  const [userSlideKey, setUserSlideKey] = useState(0);

  const multi = banners.length > 1;
  const intervalSec =
    settings?.slide_interval_seconds != null && Number.isFinite(settings.slide_interval_seconds)
      ? settings.slide_interval_seconds
      : null;
  const autoSlide =
    multi &&
    Boolean(settings?.auto_slide_enabled) &&
    intervalSec != null &&
    intervalSec > 0;

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!multi || contentWidth <= 0) return;
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / contentWidth);
      const clamped = Math.min(Math.max(next, 0), banners.length - 1);
      setIndex(clamped);
    },
    [banners.length, contentWidth, multi],
  );

  const onScrollBeginDrag = useCallback(() => {
    if (multi) setUserSlideKey((k) => k + 1);
  }, [multi]);

  useEffect(() => {
    if (!autoSlide || intervalSec == null) return;
    const ms = intervalSec * 1000;
    const id = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % banners.length;
        requestAnimationFrame(() => {
          try {
            flatRef.current?.scrollToIndex({ index: next, animated: true });
          } catch {
            flatRef.current?.scrollToOffset({ offset: next * contentWidth, animated: true });
          }
        });
        return next;
      });
    }, ms);
    return () => clearInterval(id);
  }, [autoSlide, intervalSec, banners.length, contentWidth, userSlideKey]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      setTimeout(() => {
        try {
          flatRef.current?.scrollToIndex({ index: info.index, animated: true });
        } catch {
          flatRef.current?.scrollToOffset({
            offset: info.index * contentWidth,
            animated: true,
          });
        }
      }, 120);
    },
    [contentWidth],
  );

  const renderItem = useCallback(
    ({ item }: { item: AppBanner }) => {
      const img = (
        <Image
          source={{ uri: item.image_url }}
          style={[styles.image, { width: contentWidth, height: bannerHeight }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={280}
        />
      );

      if (item.target_url) {
        return (
          <Pressable
            onPress={() => handleBannerPress(item)}
            accessibilityRole="button"
            accessibilityLabel="Publicidade"
            style={{ width: contentWidth }}
          >
            {img}
          </Pressable>
        );
      }

      return <View style={{ width: contentWidth }}>{img}</View>;
    },
    [bannerHeight, contentWidth],
  );

  if (banners.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {multi ? (
        <View style={[styles.listClip, { height: bannerHeight }]}>
          <FlatList
            ref={flatRef}
            data={banners}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onScrollBeginDrag={onScrollBeginDrag}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollToIndexFailed={onScrollToIndexFailed}
            getItemLayout={(_, i) => ({
              length: contentWidth,
              offset: contentWidth * i,
              index: i,
            })}
            initialNumToRender={2}
            windowSize={3}
            decelerationRate="fast"
          />
        </View>
      ) : (
        <View style={[styles.card, { width: contentWidth }]}>
          {renderItem({ item: banners[0] })}
        </View>
      )}

      {multi ? (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View
              key={b.id}
              style={[styles.dot, i === index ? styles.dotActive : styles.dotIdle]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
    marginBottom: 4,
  },
  listClip: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  card: {
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  image: {
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#10B981',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotIdle: {
    backgroundColor: '#CBD5E1',
  },
});

export const AppBannersSection = React.memo(AppBannersSectionInner);
