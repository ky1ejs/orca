import { useState } from 'react';
import { useLinkPullRequest } from './useGraphQL.js';

interface UseLinkPrFormOptions {
  taskId: string;
  onSuccess?: () => void;
}

export function useLinkPrForm({ taskId, onSuccess }: UseLinkPrFormOptions) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const { linkPullRequest, fetching: linking } = useLinkPullRequest();

  const handleCancel = () => {
    setShowForm(false);
    setUrl('');
    setLinkError(null);
  };

  const handleLink = async () => {
    if (!url.trim()) return;
    setLinkError(null);
    const result = await linkPullRequest({ taskId, url: url.trim() });
    if (result.error) {
      setLinkError(result.error.graphQLErrors[0]?.message ?? result.error.message);
      return;
    }
    handleCancel();
    onSuccess?.();
  };

  const setUrlWithClear = (value: string) => {
    setUrl(value);
    setLinkError(null);
  };

  return {
    showForm,
    setShowForm,
    url,
    setUrl: setUrlWithClear,
    linkError,
    linking,
    handleCancel,
    handleLink,
  };
}
