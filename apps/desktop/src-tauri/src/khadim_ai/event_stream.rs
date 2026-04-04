use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, Notify};

pub struct EventStream<T, R>
where
    T: Send + 'static,
    R: Clone + Send + 'static,
{
    rx: mpsc::UnboundedReceiver<T>,
    result: Arc<Mutex<Option<R>>>,
    notify: Arc<Notify>,
}

pub struct EventStreamHandle<T, R>
where
    T: Send + 'static,
    R: Clone + Send + 'static,
{
    tx: mpsc::UnboundedSender<T>,
    result: Arc<Mutex<Option<R>>>,
    notify: Arc<Notify>,
}

impl<T, R> EventStream<T, R>
where
    T: Send + 'static,
    R: Clone + Send + 'static,
{
    pub fn new() -> (Self, EventStreamHandle<T, R>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let result = Arc::new(Mutex::new(None));
        let notify = Arc::new(Notify::new());
        (
            Self {
                rx,
                result: result.clone(),
                notify: notify.clone(),
            },
            EventStreamHandle { tx, result, notify },
        )
    }

    pub async fn next(&mut self) -> Option<T> {
        self.rx.recv().await
    }

    pub async fn result(&self) -> R {
        loop {
            if let Some(result) = self.result.lock().await.clone() {
                return result;
            }
            self.notify.notified().await;
        }
    }
}

impl<T, R> EventStreamHandle<T, R>
where
    T: Send + 'static,
    R: Clone + Send + 'static,
{
    pub fn push(&self, event: T) {
        let _ = self.tx.send(event);
    }

    pub async fn finish(&self, result: R) {
        *self.result.lock().await = Some(result);
        self.notify.notify_waiters();
    }
}
