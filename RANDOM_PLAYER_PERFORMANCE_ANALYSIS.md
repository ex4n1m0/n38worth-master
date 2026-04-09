# Random Player Creation Performance Analysis

## Current Performance Issue
- **Expected**: 3 minutes interval
- **Actual**: ~5 minutes creation time
- **Root Cause**: Multiple bottlenecks in avatar fetching and processing

## Identified Bottlenecks

### 1. Unsplash API Calls
- **Current**: 6 attempts × 10s timeout = 60s maximum
- **Issue**: Network latency, rate limiting, no parallel requests
- **Impact**: HIGH

### 2. Avatar Compression
- **Current**: Binary search + multiple dimension attempts
- **Issue**: CPU-intensive, sequential processing
- **Impact**: MEDIUM-HIGH

### 3. Database Operations
- **Current**: Individual queries for duplicate checking
- **Issue**: No batch operations, multiple round trips
- **Impact**: MEDIUM

### 4. Cleanup Process
- **Current**: Loops through all NPCs individually
- **Issue**: N+1 query problem, no batch deletes
- **Impact**: MEDIUM (only affects when many old NPCs exist)

## Recommended Optimizations

### Priority 1: Optimize Unsplash Fetching
```typescript
// Reduce attempts from 6 to 3
// Add parallel fetching (fetch 2-3 images simultaneously)
// Increase timeout to 15s but reduce total attempts
```

### Priority 2: Optimize Avatar Compression
```typescript
// Use fixed quality (85) instead of binary search
// Skip compression if image is already small
// Add timeout to download (10s max)
```

### Priority 3: Batch Database Operations
```typescript
// Batch duplicate checks using IN clause
// Combine username and avatar checks in single query
```

### Priority 4: Optimize Cleanup
```typescript
// Use batch deletes instead of individual deletes
// Add index on isNpc and createdAt columns
// Limit cleanup to top 10 oldest NPCs per run
```

## Implementation Plan

1. **Phase 1**: Reduce Unsplash attempts and add parallel fetching
2. **Phase 2**: Simplify compression logic
3. **Phase 3**: Batch database operations
4. **Phase 4**: Optimize cleanup process

## Expected Improvement
- **Current**: ~5 minutes
- **After Phase 1**: ~3-4 minutes
- **After Phase 2**: ~2-3 minutes
- **After Phase 3**: ~2 minutes
- **After Phase 4**: ~1.5-2 minutes