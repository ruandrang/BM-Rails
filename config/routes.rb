Rails.application.routes.draw do
  root "clubs#index"

  resource :session, only: [ :new, :create, :destroy ]
  resource :registration, only: [ :new, :create ]

  resources :clubs do
    member do
      get :export_json
      post :import_json
    end

    resources :members do
      collection do
        post :import_csv
        get :export_csv
        patch :reorder
      end
    end

    resources :matches do
      member do
        patch :record_results
        get :share
      end
    end

    resources :stats, only: [ :index ]
  end

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
end
