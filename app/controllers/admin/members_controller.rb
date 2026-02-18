class Admin::MembersController < Admin::BaseController
  before_action :set_member, only: [ :show, :edit, :update, :destroy ]

  def index
    scope = Member.includes(:club).order(:id)

    if params[:q].present?
      q = "%#{params[:q]}%"
      scope = scope.where("members.name LIKE ?", q)
    end

    if params[:position].present?
      scope = scope.where(position: params[:position])
    end

    @members = paginate(scope)
  end

  def show
  end

  def edit
  end

  def update
    if @member.update(member_params)
      redirect_to admin_member_path(@member), notice: t("admin.members.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @member.destroy
    redirect_to admin_members_path, notice: t("admin.members.notices.deleted")
  end

  private

  def set_member
    @member = Member.includes(:club, :teams).find(params[:id])
  end

  def member_params
    params.require(:member).permit(:name, :position, :jersey_number, :age, :height_cm)
  end
end
