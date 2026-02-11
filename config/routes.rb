Rails.application.routes.draw do
  mount ActionCable.server => "/cable"
  root "clubs#index"

  resource :session, only: [ :new, :create, :destroy ]
  resource :registration, only: [ :new, :create ]
  resource :setting, only: [ :show, :update ]
  resources :scoreboards, only: [ :index ]

  resources :clubs do
    collection do
      get :backup
      get :export_all
      post :import_all
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
        get :scoreboard, to: "scoreboards#control"
        get :share
        patch :move_member # 멤버 이동
        patch :add_member # 멤버 추가
        patch :remove_member # 멤버 제거
        patch :add_game
        patch :remove_game
        patch :record_results
        patch :save_game_scores
        patch :save_quarter_scores
        patch :update_scores # 점수 일괄 수정
        patch :shuffle_teams # 팀 랜덤 재배치
        get :scoreboard_display, to: "scoreboards#display"
      end
    end

    resources :stats, only: [ :index ]
  end

  get "standalone_scoreboard", to: "scoreboards#standalone_control", as: :standalone_scoreboard
  get "standalone_display", to: "scoreboards#standalone_display", as: :standalone_display

  namespace :admin do
    root "dashboard#index"
    resources :users, only: [ :index, :show ]
    resources :clubs, only: [ :index, :show ]
    resources :members, only: [ :index, :show ]
    resources :matches, only: [ :index, :show ]
    resources :teams, only: [ :index, :show ]
    resources :team_members, only: [ :index, :show ]
    resources :games, only: [ :index, :show ]
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
